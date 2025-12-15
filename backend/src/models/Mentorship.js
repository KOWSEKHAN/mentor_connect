// backend/src/models/Mentorship.js
import mongoose from 'mongoose';

const mentorshipSchema = new mongoose.Schema({
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, default: '' }, // e.g., "Web Dev"
  startedAt: { type: Date, default: Date.now },
  progress: { type: Number, default: 0 }, // 0-100
  status: { type: String, enum: ['active', 'completed'], default: 'active' }
});

export default mongoose.model('Mentorship', mentorshipSchema);
