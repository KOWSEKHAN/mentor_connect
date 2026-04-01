// backend/src/models/Mentorship.js
import mongoose from 'mongoose';

const mentorshipSchema = new mongoose.Schema({
  mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  menteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, default: '' }, // e.g., "Web Dev"
  message: { type: String, default: '' },
  startedAt: { type: Date, default: Date.now },
  levels: {
    type: [String],
    default: ['beginner', 'intermediate', 'advanced', 'master'],
  },
  currentLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'master'],
    default: 'beginner',
  },
  progress: { type: Number, default: 0 }, // 0-100
  status: { type: String, enum: ['pending', 'accepted', 'completed'], default: 'pending' }
});

// Prevent duplicate mentorships for the same pair/domain.
mentorshipSchema.index({ mentorId: 1, menteeId: 1, domain: 1 }, { unique: true });

export default mongoose.model('Mentorship', mentorshipSchema);
