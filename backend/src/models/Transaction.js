import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  amount: { type: Number, required: true },
  reason: {
    type: String,
    enum: [
      'signup_bonus',
      'task_reward',
      'course_reward',
      'course_purchase',
      'mentor_earning',
      'recharge',
      'withdrawal'
    ],
    required: true
  },
  referenceId: { type: String, default: null }, // taskId, courseId, requestId, paymentId
  status: { type: String, enum: ['pending', 'approved', 'processing', 'paid', 'completed', 'failed'], default: 'completed' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  actorRole: { type: String, enum: ['mentor', 'mentee', 'admin', 'system'] },
  payoutRef: { type: String, default: null }
}, { timestamps: true });

// Idempotency constraint (DB-enforced)
transactionSchema.index(
  { userId: 1, referenceId: 1, reason: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $type: "string" } } }
);

// Global Cross-service protection
transactionSchema.index(
  { referenceId: 1, reason: 1 },
  { unique: true, partialFilterExpression: { referenceId: { $type: "string" } } }
);

export default mongoose.model('Transaction', transactionSchema);
