import User from '../models/User.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import Tesseract from 'tesseract.js'
import mammoth from 'mammoth'
import { extractKeywords } from '../utils/resumeParser.js'
import { grantPointsOnce } from '../services/pointService.js'

const JWT_SECRET = process.env.JWT_SECRET || 'please_change_this_secret'

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

    try {
      await grantPointsOnce(user._id, 100, 'signup', `signup:${user._id}`, 'Signup reward')
    } catch (ptErr) {
      console.error('Signup reward failed:', ptErr)
    }

    const refreshed = await User.findById(user._id).select('points').lean()
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
    const userPayload = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: refreshed?.points ?? 0,
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

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
    const userPayload = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points != null ? user.points : 0,
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
    const userPayload = {
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points != null ? user.points : 0,
    }
    res.json({ user: userPayload })
  } catch (err) {
    console.error(err)
    return res.status(401).json({ message: 'Not authorized' })
  }
}
