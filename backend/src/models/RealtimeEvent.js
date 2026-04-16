import mongoose from 'mongoose';

const realtimeEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    type: { type: String, required: true, index: true },
    version: { type: Number, required: true, index: true },
    timestamp: { type: Date, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorRole: { type: String, default: '', index: true },
    actionSource: {
      type: String,
      enum: ['mentor_ui', 'mentee_ui', 'system', 'api'],
      default: 'system',
      index: true,
    },
  },
  { timestamps: true }
);

realtimeEventSchema.index({ courseId: 1, version: 1 }, { unique: true });
realtimeEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: Number(process.env.REALTIME_EVENT_TTL_SEC || 2592000) });

export default mongoose.model('RealtimeEvent', realtimeEventSchema);
