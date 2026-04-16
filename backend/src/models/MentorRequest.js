// backend/src/models/MentorRequest.js
import mongoose from 'mongoose';

const mentorRequestSchema = new mongoose.Schema({
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  domain: { type: String, default: '' },
  message: { type: String, default: '' },
  coursePrice: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'price_set', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  respondedAt: { type: Date }
});

export default mongoose.model('MentorRequest', mentorRequestSchema);
