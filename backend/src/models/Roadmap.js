import mongoose from 'mongoose';

const roadmapSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Course',
      required: true,
      index: true,
    },
    menteeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mentorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    generatedBy: {
      type: String,
      enum: ['mentee', 'mentor', 'ai'],
      required: true,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    steps: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RoadmapStep',
      },
    ],
  },
  { timestamps: true }
);

roadmapSchema.index({ courseId: 1, menteeId: 1, version: -1 });
roadmapSchema.index({ courseId: 1, menteeId: 1, isActive: 1 });
roadmapSchema.index(
  { courseId: 1, menteeId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

roadmapSchema.pre('save', async function (next) {
  if (this.isNew && this.isActive === true) {
    await mongoose.model('Roadmap').updateMany(
      { courseId: this.courseId, menteeId: this.menteeId, _id: { $ne: this._id }, isActive: true },
      { isActive: false }
    );
  }
  if (this.isModified('isActive') && this.isActive === true) {
    await mongoose.model('Roadmap').updateMany(
      { courseId: this.courseId, menteeId: this.menteeId, _id: { $ne: this._id }, isActive: true },
      { isActive: false }
    );
  }
  next();
});

export default mongoose.model('Roadmap', roadmapSchema);
