import mongoose from 'mongoose'

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['mentor', 'mentee', 'admin', 'super_admin'], required: true },
  // Resume and keywords
  resumeUrl: { type: String },
  keywords: [{ type: String }], // unified keywords extracted from resume
  interests: [{ type: String }], // mentee only - interests/skills
  expertise: [{ type: String }], // mentor only - expertise/skills
  profilePhoto: { type: String },
  phone: { type: String, trim: true },
  upiId: { type: String, trim: true },
  // Part 5: Razorpay fund account — set once on first withdrawal, reused thereafter
  fundAccountId:      { type: String, default: null },
  razorpayContactId:  { type: String, default: null },
  // Legacy fields for backward compatibility
  resumeURL: { type: String },
  extractedSkills: { type: [String], default: [] },
  lastSeen: { type: Date },
  points: { type: Number, default: 0, min: 0 },
  blocked:      { type: Boolean, default: false },
  tokenVersion: { type: Number,  default: 0 },    // Fix 1: incremented to invalidate sessions
  createdAt:    { type: Date,    default: Date.now }
})

export default mongoose.model('User', userSchema)
