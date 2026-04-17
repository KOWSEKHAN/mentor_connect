import User from '../models/User.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import Tesseract from 'tesseract.js'
import mammoth from 'mammoth'
import { extractKeywords } from '../utils/resumeParser.js'
import { getJwtSecret } from '../config/jwt.js'
import { getWallet, processCredit, creditRewardPoints } from '../services/walletService.js'
import Transaction from '../models/Transaction.js'

const readFileTextByType = async (filePath, mimeType) => {
  const ext = path.extname(filePath || '').toLowerCase()

  // Handle plain text
  if (mimeType === 'text/plain' || ext === '.txt') {
    return fs.promises.readFile(filePath, 'utf8')
  }

  // Handle PDFs
  if (
    mimeType === 'application/pdf' ||
    ext === '.pdf'
  ) {
    const buffer = await fs.promises.readFile(filePath)
    const data = await pdfParse(buffer)
    return data.text || ''
  }

  // Handle DOC/DOCX using mammoth
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    ext === '.docx' ||
    ext === '.doc'
  ) {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value || ''
  }

  // Handle basic image types via Tesseract OCR
  if (
    mimeType?.startsWith('image/') ||
    ext === '.jpg' ||
    ext === '.jpeg' ||
    ext === '.png'
  ) {
    const { data } = await Tesseract.recognize(filePath, 'eng')
    return data.text || ''
  }

  return ''
}

export const signup = async (req, res) => {
  try {
    const { name, email, password, role, interests } = req.body
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' })
    }
    if (role === 'admin') {
      return res.status(400).json({ message: 'Cannot register as admin via public endpoint' })
    }

    const existing = await User.findOne({ email })
    if (existing) return res.status(400).json({ message: 'Email already registered' })

    const hashed = await bcrypt.hash(password, 10)

    // Handle optional resume upload + keyword extraction
    let resumeUrl = null
    let keywords = []

    if (req.file) {
      const allowedExt = ['.pdf', '.doc', '.docx', '.txt']
      const fileExt = path.extname(req.file.originalname || '').toLowerCase()

      if (!allowedExt.includes(fileExt)) {
        return res.status(400).json({ message: 'Unsupported file type. Please upload .pdf, .docx, or .txt' })
      }

      const fullPath = req.file.path
      resumeUrl = `/${fullPath.replace(/\\\\/g, '/').replace(/\\/g, '/')}`

      try {
        const text = await readFileTextByType(fullPath, req.file.mimetype)
        keywords = extractKeywords(text)
      } catch (parseErr) {
        console.error('Failed to parse resume for keywords:', parseErr)
        keywords = []
      }
    }

    // Handle manual interests/expertise input (optional)
    const manualInput = Array.isArray(interests)
      ? interests
      : typeof interests === 'string' && interests.length > 0
        ? interests.split(',').map((i) => i.trim()).filter(Boolean)
        : []

    // Combine resume keywords with manual input
    const allKeywords = [...new Set([...keywords, ...manualInput])]

    // Assign based on role
    const userData = {
      name,
      email,
      password: hashed,
      role,
      resumeUrl,
      keywords: allKeywords
    }

    if (role === 'mentee') {
      userData.interests = allKeywords
    } else if (role === 'mentor') {
      userData.expertise = allKeywords
    }

    // Backward compatibility: also set legacy fields
    userData.resumeURL = resumeUrl
    userData.extractedSkills = keywords

    const user = await User.create(userData)

    // ── Signup bonus: mentees only, exactly once ─────────────────────────────
    if (user.role === 'mentee') {
      try {
        const signupRef = `signup_${user._id}`;

        // DB-level unique index on { userId, referenceId, reason } guarantees idempotency
        const alreadyRewarded = await Transaction.findOne({
          userId: user._id,
          reason: 'signup_bonus',
          referenceId: signupRef
        });

        if (!alreadyRewarded) {
          // Part 4: Signup bonus → rewardPoints (virtual), NOT walletPoints (real money)
          // 10,000 raw points = 100 display points (stored as-is, not ×100)
          await creditRewardPoints(
            user._id,
            10000,          // 10,000 reward points (100 display pts)
            'signup_bonus',
            signupRef,
            user._id,
            'system'
          );
          console.log(`[SIGNUP_BONUS] Granted 10,000 reward pts to mentee ${user._id}`);
        } else {
          console.log(`[SIGNUP_BONUS] Already rewarded — skipping for ${user._id}`);
        }
      } catch (bonusErr) {
        // Non-fatal: user is created even if reward fails.
        // Log full error so it's visible during debugging.
        console.error('[SIGNUP_BONUS_ERROR]', bonusErr.message, bonusErr);
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Part 1: Only create/fetch wallet for mentor and mentee — admin has no wallet
    const hasWallet = ['mentor', 'mentee'].includes(user.role);
    const wallet = hasWallet ? await getWallet(user._id) : null;

    const token = jwt.sign({ id: user._id, role: user.role, tokenVersion: user.tokenVersion ?? 0 }, getJwtSecret(), { expiresIn: '7d' })
    const userPayload = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      // Part 7: Separate display values
      walletPoints:  wallet?.walletPoints ?? 0,
      rewardPoints:  wallet?.rewardPoints ?? 0,
      points:        wallet?.walletPoints ?? 0,   // legacy alias
      walletInfo:    wallet ?? null,
    }
    res.status(201).json({ message: 'Signup successful', user: userPayload, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

export const login = async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' })

    const user = await User.findOne({ email })
    if (!user) return res.status(400).json({ message: 'Invalid credentials' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(400).json({ message: 'Invalid credentials' })

    // Part 1: Admin has no wallet — skip getWallet entirely
    const hasWallet = ['mentor', 'mentee'].includes(user.role);
    const wallet = hasWallet ? await getWallet(user._id) : null;

    const token = jwt.sign({ id: user._id, role: user.role, tokenVersion: user.tokenVersion ?? 0 }, getJwtSecret(), { expiresIn: '7d' })
    const userPayload = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: wallet?.balance ?? 0,
      walletInfo: wallet ?? null,
    }
    res.json({ message: 'Login successful', user: userPayload, token })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * Get current user from JWT (for session restore / auth persistence)
 * GET /api/auth/me
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password').lean()
    if (!user) return res.status(401).json({ message: 'User not found' })

    // Part 1: Admin has no wallet
    const hasWallet = ['mentor', 'mentee'].includes(user.role);
    const wallet = hasWallet ? await getWallet(user._id) : null;

    const userPayload = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: wallet?.balance ?? 0,
      walletInfo: wallet ?? null,
    }
    res.json({ user: userPayload })
  } catch (err) {
    console.error(err)
    return res.status(401).json({ message: 'Not authorized' })
  }
}
