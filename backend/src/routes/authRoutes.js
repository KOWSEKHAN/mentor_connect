import express from 'express'
import multer from 'multer'
import path from 'path'
import { signup, login, getMe } from '../controllers/authController.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

// Multer storage configuration for resume uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/resumes')
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '_')
    cb(null, `${Date.now()}_${base}${ext}`)
  }
})

const upload = multer({
  storage
})

router.post('/signup', upload.single('resume'), signup)
router.post('/login', login)
router.get('/me', protect, getMe)

export default router
