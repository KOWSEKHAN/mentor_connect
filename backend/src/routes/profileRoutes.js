// backend/src/routes/profileRoutes.js
import express from 'express'
import multer from 'multer'
import path from 'path'
import { protect } from '../middleware/auth.js'
import { getProfile, updateProfile } from '../controllers/profileController.js'

const router = express.Router()

// Multer storage configuration for profile photo and resume uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'profilePhoto') {
      cb(null, 'uploads/profile-photos')
    } else if (file.fieldname === 'resume') {
      cb(null, 'uploads/resumes')
    } else {
      cb(null, 'uploads')
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_')
    cb(null, `${Date.now()}_${base}${ext}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
})

// GET /api/profile/me - Get current user's profile
router.get('/me', protect, getProfile)

// PUT /api/profile/update - Update profile (supports multipart/form-data for file uploads)
router.put(
  '/update',
  protect,
  upload.fields([
    { name: 'profilePhoto', maxCount: 1 },
    { name: 'resume', maxCount: 1 }
  ]),
  updateProfile
)

export default router

