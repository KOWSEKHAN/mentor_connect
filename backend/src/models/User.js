import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['mentor', 'mentee'], required: true },
  // Resume and keywords
  resumeUrl: { type: String },
  keywords: [{ type: String }], // unified keywords extracted from resume
  interests: [{ type: String }], // mentee only - interests/skills
  expertise: [{ type: String }], // mentor only - expertise/skills
  profilePhoto: { type: String },
  // Legacy fields for backward compatibility
  resumeURL: { type: String },
  extractedSkills: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
})

export default mongoose.model('User', userSchema)
