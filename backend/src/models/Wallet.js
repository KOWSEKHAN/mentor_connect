import mongoose from 'mongoose';

const walletSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  role:         { type: String, enum: ['mentor', 'mentee'], required: true },

  // Part 1: Dual-balance fields ─────────────────────────────────────────────
  walletPoints: { type: Number, default: 0, min: 0 },
  rewardPoints: { type: Number, default: 0, min: 0 },
  // Part 1: Locked during pending withdrawal — cannot be spent until confirmed/refunded
  lockedPoints: { type: Number, default: 0, min: 0 },
  balance:      { type: Number, default: 0, min: 0 },  // legacy mirror

  totalEarned:  { type: Number, default: 0 },
  totalSpent:   { type: Number, default: 0 },
}, { timestamps: true });

// Safety guard — admins must never have wallets
walletSchema.pre('validate', function (next) {
  if (!['mentor', 'mentee'].includes(this.role)) {
    return next(new Error(`[WALLET] Invalid role '${this.role}' — only mentor and mentee may have wallets`));
  }
  next();
});

export default mongoose.model('Wallet', walletSchema);
