import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, default: 'admin' },
  action:    { type: String, required: true },
  targetId:  { type: mongoose.Schema.Types.ObjectId },
  targetRef: { type: String },
  metadata:  { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
  versionKey: false,  // Fix 3: no __v on audit records
});

auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ targetId: 1 });

// ── Fix 3: AuditLog Tamper Protection ─────────────────────────────────────────
// AuditLogs are append-only. Block any update or delete at the ODM level.
const IMMUTABLE_ERROR = new Error('[AUDIT_LOG] AuditLog is immutable — updates and deletes are forbidden');

for (const hook of ['updateOne', 'findOneAndUpdate', 'updateMany', 'replaceOne']) {
  auditLogSchema.pre(hook, function () { throw IMMUTABLE_ERROR; });
}
for (const hook of ['deleteOne', 'findOneAndDelete', 'deleteMany']) {
  auditLogSchema.pre(hook, function () { throw IMMUTABLE_ERROR; });
}
// Block instance-level save() on existing docs (only allow first insert)
auditLogSchema.pre('save', function () {
  if (!this.isNew) throw IMMUTABLE_ERROR;
});

export default mongoose.model('AuditLog', auditLogSchema);
