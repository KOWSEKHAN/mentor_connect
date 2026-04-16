import mongoose from 'mongoose';

const courseSnapshotSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    realtimeVersion: { type: Number, required: true, index: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

courseSnapshotSchema.index({ courseId: 1, realtimeVersion: -1 });

export default mongoose.model('CourseSnapshot', courseSnapshotSchema);
