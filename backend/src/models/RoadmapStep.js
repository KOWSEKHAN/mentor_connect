import mongoose from 'mongoose';

const roadmapStepSchema = new mongoose.Schema(
  {
    roadmapId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Roadmap',
      required: true,
      index: true,
    },
    order: {
      type: Number,
      required: true,
      index: true,
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced', 'master'],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      default: '',
    },
    subtopics: [
      {
        type: String,
        trim: true,
        maxlength: 200,
      },
    ],
    aiContentGenerated: {
      type: Boolean,
      default: false,
      index: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
      index: true,
    },
  },
  { timestamps: true }
);

roadmapStepSchema.index({ roadmapId: 1, order: 1 }, { unique: true });
roadmapStepSchema.index({ roadmapId: 1, level: 1 });

export default mongoose.model('RoadmapStep', roadmapStepSchema);
