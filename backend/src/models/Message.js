// backend/src/models/Message.js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    mentorshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mentorship',
      required: true
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course'
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    senderRole: {
      type: String,
      enum: ['mentor', 'mentee'],
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },
    message: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'seen'],
      default: 'sent'
    },
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  {
    timestamps: { createdAt: true, updatedAt: true }
  }
);

// Indexes for enterprise query performance
messageSchema.index({ mentorshipId: 1 });
messageSchema.index({ courseId: 1 });
messageSchema.index({ timestamp: 1 });
messageSchema.index({ mentorshipId: 1, createdAt: 1 });
messageSchema.index({ createdAt: 1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ mentorshipId: 1, status: 1 });

export default mongoose.model('Message', messageSchema);
