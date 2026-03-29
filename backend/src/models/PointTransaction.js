import mongoose from 'mongoose';

const pointTransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  points: { type: Number, required: true },
  type: {
    type: String,
    required: true,
    enum: ['signup', 'course_completion', 'task_completion', 'mentor_reward', 'spend'],
  },
  referenceId: { type: String, default: null },
  description: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

pointTransactionSchema.index({ userId: 1, type: 1, referenceId: 1 }, { unique: true });

export default mongoose.model('PointTransaction', pointTransactionSchema);
