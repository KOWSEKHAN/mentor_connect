// backend/src/models/Course.js
import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  domain: { type: String, required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional for independent learning
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentorshipId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mentorship' },
  // New explicit linkage fields (kept in sync with mentor/mentee for clarity)
  mentorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  menteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  currentLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced', 'master'],
    default: 'beginner',
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed'],
    default: 'in_progress',
  },
  certificateIssued: { type: Boolean, default: false },
  completedAt: { type: Date },
  aiContent: { type: String, default: '' },
  roadmap: [{
    step: String,
    completed: { type: Boolean, default: false }
  }],
  tasks: [{
    title: String,
    completed: { type: Boolean, default: false }
  }],
  notes: { type: String, default: '' },
  realtimeVersion: { type: Number, default: 0, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Course', courseSchema);

