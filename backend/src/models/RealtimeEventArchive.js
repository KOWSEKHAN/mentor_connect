import mongoose from 'mongoose';

const archiveSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    type: { type: String, required: true, index: true },
    version: { type: Number, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorRole: { type: String, default: '' },
    actionSource: { type: String, default: 'system' },
    archivedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

archiveSchema.index({ courseId: 1, version: 1 });

export default mongoose.model('RealtimeEventArchive', archiveSchema);
