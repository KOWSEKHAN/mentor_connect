// backend/src/models/AIContent.js
import mongoose from 'mongoose';

/**
 * Versioned AI content store.
 *
 * Lifecycle:
 *   isActive: true        → the draft currently visible to the mentor (latest, at most one per courseId+level)
 *   status: 'published'   → the version visible to the mentee (at most one per courseId+level)
 *   generationStatus      → tracks the LLM call lifecycle for observability
 *
 * History:
 *   All versions are kept (max 10 retained by controller's enforceVersionRetention).
 *   Published versions are excluded from retention deletion.
 */
const aiContentSchema = new mongoose.Schema(
  {
    courseId: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Course',
      required: true,
      index:    true,
    },
    level: {
      type:     String,
      enum:     ['beginner', 'intermediate', 'advanced', 'master'],
      required: true,
      index:    true,
    },

    /* ── Content (structured, never a JSON string) ─────────────────────── */
    content: {
      explanation: { type: String, default: '' },
      examples:    [{ type: String }],
      resources:   [{ type: String }],
    },

    /* ── Versioning ─────────────────────────────────────────────────────── */
    version: {
      type:    Number,
      default: 1,
      index:   true,
    },

    /* ── Lifecycle ──────────────────────────────────────────────────────── */
    status: {
      type:    String,
      enum:    ['draft', 'published'],
      default: 'draft',
      index:   true,
    },
    isActive: {
      type:    Boolean,
      default: true,
      index:   true,
    },

    /* ── Generation status (LLM call observability) ─────────────────────── */
    generationStatus: {
      type:    String,
      enum:    ['idle', 'generating', 'failed'],
      default: 'idle',
      index:   true,
    },

    /* ── Traceability ───────────────────────────────────────────────────── */
    promptUsed: {
      type:    String,
      default: null,
    },
    promptVersion: {
      type:    String,     // e.g. 'v1' — bump in circuitBreakerService.PROMPT_VERSION
      default: 'v1',
    },
    llmModel: {
      type:    String,
      default: null,
    },
    generationMeta: {
      durationMs: { type: Number, default: null },
      tokens:     { type: Number, default: null },  // estimated from response length
      attempts:   { type: Number, default: 1 },
    },

    /* ── Quality ────────────────────────────────────────────────────────── */
    qualityScore: {
      type:    Number,
      min:     1,
      max:     5,
      default: null,
    },

    /* ── Idempotency (prevents duplicate generation on network retry) ────── */
    idempotencyKey: {
      type:    String,
      default: null,
      index:   true,  // sparse so null values don't conflict
    },

    generatedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
    },
  },
  { timestamps: true }
);

/* ── Indexes ──────────────────────────────────────────────────────────────── */
aiContentSchema.index({ courseId: 1, level: 1, version: 1 }, { unique: true });
aiContentSchema.index({ courseId: 1, level: 1, isActive:  1 });
aiContentSchema.index({ courseId: 1, level: 1, status:    1 });
aiContentSchema.index({ courseId: 1, level: 1, generationStatus: 1 });
// For idempotency lookup — partial index on non-null keys only
aiContentSchema.index(
  { idempotencyKey: 1 },
  { sparse: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

export default mongoose.model('AIContent', aiContentSchema);
