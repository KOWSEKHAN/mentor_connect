// backend/src/controllers/profileController.js
import User from '../models/User.js'
import { extractKeywords } from '../utils/resumeParser.js'
import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

// Helper function to read file text (reused from authController)
const readFileTextByType = async (filePath, mimeType) => {
  const ext = path.extname(filePath || '').toLowerCase()

  if (mimeType === 'text/plain' || ext === '.txt') {
    return fs.promises.readFile(filePath, 'utf8')
  }

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    const buffer = await fs.promises.readFile(filePath)
    const data = await pdfParse(buffer)
    return data.text || ''
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    ext === '.docx' ||
    ext === '.doc'
  ) {
    const result = await mammoth.extractRawText({ path: filePath })
    return result.value || ''
  }

  return ''
}

/**
 * GET /api/profile/me
 * Get current user's profile
 */
export const getProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id
    const user = await User.findById(userId).select('-password')
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({ user })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

/**
 * PUT /api/profile/update
 * Update user profile (name, email, profilePhoto, interests/expertise)
 */
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id
    const { name, email, interests, expertise } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    // Update basic fields
    if (name) user.name = name
    if (email) {
      // Check if email is already taken by another user
      const existing = await User.findOne({ email, _id: { $ne: userId } })
      if (existing) {
        return res.status(400).json({ message: 'Email already in use' })
      }
      user.email = email
    }

    // Handle profile photo upload
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      const photoFile = req.files.profilePhoto[0]
      const photoPath = `/${photoFile.path.replace(/\\\\/g, '/').replace(/\\/g, '/')}`
      user.profilePhoto = photoPath
    }

    // Handle resume upload and keyword extraction
    let newKeywords = []
    if (req.files && req.files.resume && req.files.resume[0]) {
      const resumeFile = req.files.resume[0]
      const allowedExt = ['.pdf', '.doc', '.docx', '.txt']
      const fileExt = path.extname(resumeFile.originalname || '').toLowerCase()

      if (!allowedExt.includes(fileExt)) {
        return res.status(400).json({ message: 'Unsupported file type. Please upload .pdf, .docx, or .txt' })
      }

      const fullPath = resumeFile.path
      user.resumeUrl = `/${fullPath.replace(/\\\\/g, '/').replace(/\\/g, '/')}`
      // Also set legacy field for backward compatibility
      user.resumeURL = user.resumeUrl

      try {
        const text = await readFileTextByType(fullPath, resumeFile.mimetype)
        newKeywords = extractKeywords(text)
      } catch (parseErr) {
        console.error('Failed to parse resume for keywords:', parseErr)
        newKeywords = []
      }
    }

    // Handle interests/expertise updates
    if (user.role === 'mentee' && interests !== undefined) {
      const interestList = Array.isArray(interests)
        ? interests
        : typeof interests === 'string' && interests.length > 0
          ? interests.split(',').map((i) => i.trim()).filter(Boolean)
          : []
      
      // Combine resume keywords with manual interests
      const allKeywords = [...new Set([...newKeywords, ...interestList])]
      user.interests = allKeywords
      user.keywords = allKeywords
    } else if (user.role === 'mentor' && expertise !== undefined) {
      const expertiseList = Array.isArray(expertise)
        ? expertise
        : typeof expertise === 'string' && expertise.length > 0
          ? expertise.split(',').map((e) => e.trim()).filter(Boolean)
          : []
      
      // Combine resume keywords with manual expertise
      const allKeywords = [...new Set([...newKeywords, ...expertiseList])]
      user.expertise = allKeywords
      user.keywords = allKeywords
    } else if (newKeywords.length > 0) {
      // If resume was uploaded but no manual input, update keywords
      user.keywords = newKeywords
      if (user.role === 'mentee') {
        user.interests = [...new Set([...(user.interests || []), ...newKeywords])]
      } else {
        user.expertise = [...new Set([...(user.expertise || []), ...newKeywords])]
      }
    }

    // Update legacy fields for backward compatibility
    if (newKeywords.length > 0) {
      user.extractedSkills = newKeywords
    }

    await user.save()

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profilePhoto: user.profilePhoto,
        resumeUrl: user.resumeUrl,
        interests: user.interests,
        expertise: user.expertise,
        keywords: user.keywords
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: 'Server error' })
  }
}

