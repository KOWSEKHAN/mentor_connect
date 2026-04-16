import mongoose from 'mongoose';

const aiContentSchema = new mongoose.Schema(
  {
    mentorshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mentorship',
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      default: null,
      index: true,
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'master'],
      required: true,
      index: true,
    },
    content: {
      type: String,
      default: '',
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true }
);

aiContentSchema.index({ mentorshipId: 1, level: 1 }, { unique: true });

export default mongoose.model('AIContent', aiContentSchema);
