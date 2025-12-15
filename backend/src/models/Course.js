// backend/src/models/Course.js
import mongoose from 'mongoose';

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  domain: { type: String, required: true },
  mentor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional for independent learning
  mentee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  progress: { type: Number, default: 0, min: 0, max: 100 },
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Course', courseSchema);

