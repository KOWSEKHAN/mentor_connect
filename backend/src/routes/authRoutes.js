import express from 'express'
import multer from 'multer'
import path from 'path'
import { signup, login } from '../controllers/authController.js'

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

export default router
