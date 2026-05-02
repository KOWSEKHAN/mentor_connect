// backend/src/controllers/aiController.js
import mongoose from 'mongoose';
import crypto, { createHash } from 'node:crypto';
import AIContent             from '../models/AIContent.js';
import Roadmap               from '../models/Roadmap.js';
import Course                from '../models/Course.js';
import { callLLM, validateContent, getCacheKey, aiMetrics } from '../services/aiService.js';
import { buildContentPrompt } from '../services/promptBuilder.js';
import { acquireLock, extendLock, releaseLock } from '../services/lockService.js';
import { llmCircuitBreaker, PROMPT_VERSION }    from '../services/circuitBreakerService.js';
import {
  emitCourseEvent,
  persistCourseEvent,
  deliverAndSnapshot,
} from '../socket/eventBuilder.js';
import { auditFromRequest } from '../utils/auditContext.js';

const LEVELS                 = ['beginner', 'intermediate', 'advanced', 'master'];
const MAX_VERSIONS_PER_LEVEL = 10;
const LOCK_TTL_SECS          = 60;
const HEARTBEAT_INTERVAL     = 15_000;  // renew lock every 15s
const HARD_TIMEOUT_MS        = Number(process.env.HARD_TIMEOUT_MS || 30_000); // 30s
const IDEMPOTENCY_WINDOW_MS  = 5 * 60 * 1000;  // 5-minute window

/* ─── Distributed Stream Session ─────────────────────────────────────────────── */
import Redis from 'ioredis';
import { EventEmitter } from 'node:events';

let redisMain = null;
let redisSub = null;
if (process.env.REDIS_URL) {
  redisMain = new Redis(process.env.REDIS_URL, { lazyConnect: true });
  redisSub = new Redis(process.env.REDIS_URL, { lazyConnect: true });
  redisMain.connect().catch(() => redisMain = null);
  redisSub.connect().catch(() => redisSub = null);
}

const localCache = new Map();
const localEmitter = new EventEmitter();
const MAX_TOKENS = 2000;

async function getStreamSession(id) {
  if (redisMain) {
    const raw = await redisMain.get(`stream:${id}`).catch(() => null);
    return raw ? JSON.parse(raw) : null;
  }
  return localCache.get(id) || null;
}

async function saveStreamSession(id, data) {
  if (data.tokens && data.tokens.length > MAX_TOKENS) {
    data.tokens = data.tokens.slice(-MAX_TOKENS);
  }
  const isCompleted = data.status === 'completed' || data.status === 'failed';
  const ttl = isCompleted ? 300 : 3600;
  if (redisMain) {
    await redisMain.set(`stream:${id}`, JSON.stringify(data), 'EX', ttl).catch(() => {});
  } else {
    data.expiresAt = Date.now() + (ttl * 1000);
    localCache.set(id, data);
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [key, session] of localCache.entries()) {
    if (session.expiresAt && now > session.expiresAt) localCache.delete(key);
  }
}, 60000).unref?.();

async function publishStreamEvent(id, obj) {
  const payload = JSON.stringify(obj);
  if (redisMain) await redisMain.publish(`pub:${id}`, payload).catch(() => {});
  else localEmitter.emit(`pub:${id}`, payload);
}

const subRouter = new EventEmitter();
subRouter.setMaxListeners(0);
if (redisSub) {
  redisSub.on('message', (channel, message) => subRouter.emit(channel, message));
}

function subscribeStream(id, callback) {
  if (redisSub) {
    const handler = (msg) => callback(msg);
    redisSub.subscribe(`pub:${id}`).catch(() => {});
    subRouter.on(`pub:${id}`, handler);
    return () => {
      subRouter.off(`pub:${id}`, handler);
      if (subRouter.listenerCount(`pub:${id}`) === 0) {
        redisSub.unsubscribe(`pub:${id}`).catch(() => {});
      }
    };
  } else {
    const handler = (msg) => callback(msg);
    localEmitter.on(`pub:${id}`, handler);
    return () => localEmitter.off(`pub:${id}`, handler);
  }
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function requireMentor(req, res) {
  if (req.user?.role !== 'mentor') {
    res.status(403).json({ message: 'Mentor only' });
    return false;
  }
  return true;
}

function toContentPayload(doc) {
  if (!doc) return null;
  return {
    explanation: doc.content?.explanation || '',
    examples:    doc.content?.examples    || [],
    resources:   doc.content?.resources   || [],
  };
}

/* ─── getAdaptiveContext ─────────────────────────────────────────────────────
 * Optional — reads the mentor's recent quality scores for this (courseId, level)
 * and returns an adaptive hint injected into the prompt.
 * Returns null silently on any error (non-critical path).
 */
async function getAdaptiveContext(courseId, level, mentorId) {
  try {
    const recent = await AIContent.find({
      courseId,
      level,
      generatedBy:  mentorId,
      qualityScore: { $ne: null },
    })
      .sort({ version: -1 })
      .limit(5)
      .select('qualityScore generationMeta.attempts')
      .lean();

    if (!recent.length) return null;

    const avgQuality = recent.reduce((s, d) => s + (d.qualityScore || 0), 0) / recent.length;
    const highRetries = recent.filter((d) => (d.generationMeta?.attempts || 1) > 1).length >= 2;

    let hint = null;
    if (avgQuality < 2.5) {
      hint = 'Previous content was rated poorly. Focus on clear, actionable explanations with at least 3 concrete examples.';
    } else if (avgQuality < 3.5) {
      hint = 'Aim for more practical examples and ensure each resource is specific and actionable.';
    } else if (highRetries) {
      hint = 'Ensure the JSON response is strictly valid with no surrounding prose.';
    }

    return { avgQuality: Number(avgQuality.toFixed(1)), hint };
  } catch {
    return null;
  }
}


/**
 * FIX 3 — Retention delete race condition.
 * Uses DB-level conditions (isActive:false, status:$ne:published) in the deleteMany
 * so concurrent requests can never delete an active or published version, even if
 * the JS filter was computed on a stale snapshot.
 */
async function enforceVersionRetention(courseId, level) {
  const all = await AIContent.find({ courseId, level })
    .sort({ version: -1 })
    .select('_id version status isActive')
    .lean();

  if (all.length <= MAX_VERSIONS_PER_LEVEL) return;

  // JS pre-filter (determines which _ids are candidates)
  const candidates = all
    .slice(MAX_VERSIONS_PER_LEVEL)
    .filter((v) => v.status !== 'published' && !v.isActive);

  if (candidates.length === 0) return;

  // DB-level conditions re-checked atomically — prevents race with concurrent generation
  const deleted = await AIContent.deleteMany({
    _id:      { $in: candidates.map((v) => v._id) },
    isActive: false,                // double-check: never delete the active draft
    status:   { $ne: 'published' }, // double-check: never delete the published version
  });

  if (deleted.deletedCount > 0) {
    console.log(`[Retention] Deleted ${deleted.deletedCount} old versions — course:${courseId} level:${level}`);
  }
}

/* ─── aiChat ─────────────────────────────────────────────────────────────── */
export const aiChat = async (req, res) => {
  try {
    if (!requireMentor(req, res)) return;
    const { message } = req.body;
    if (!message) return res.status(400).json({ message: 'Message is required' });

    const lower = message.toLowerCase();
    let response = `I understand you're asking about: "${message}". Focus on fundamentals first, then practise consistently.`;
    if (lower.includes('roadmap') || lower.includes('plan'))
      response = 'A strong roadmap starts with fundamentals and progresses through intermediate, advanced, and master stages.';
    else if (lower.includes('progress') || lower.includes('track'))
      response = 'Track progress by completing tasks at each level. Consistency is key!';
    else if (lower.includes('help'))
      response = 'Ask me about roadmaps, content, or learning strategies for your mentee.';

    return res.json({ response, timestamp: new Date() });
  } catch (err) {
    console.error('[aiChat]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── generateLevelContent ───────────────────────────────────────────────── */
/**
 * POST /api/ai/generate-level-content
 * body: { courseId, level, prompt? }
 *
 * Full production pipeline:
 *  1. Distributed lock (Redis / in-process fallback)
 *  2. Heartbeat setInterval keeps lock alive during long LLM calls (FIX 1)
 *  3. Roadmap-first guard
 *  4. Previous level context fetch (for continuity)
 *  5. Pending doc created BEFORE LLM call (generationStatus:'generating') — DB-visible
 *  6. LLM call with 2-attempt retry + circuit breaker (phiService)
 *  7. Content validation — reject before any DB write
 *  8. Atomic: update pending doc with content + traceability metadata + emit event
 *  9. Version retention — DB-level double-check prevents race (FIX 3)
 */
export const generateLevelContent = async (req, res) => {
  const { courseId, level, prompt } = req.body;

  if (!requireMentor(req, res)) return;
  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId))
    return res.status(400).json({ message: 'Valid courseId is required' });
  if (!level || !LEVELS.includes(level))
    return res.status(400).json({ message: `level must be one of: ${LEVELS.join(', ')}` });

  // ── 1. Distributed lock ────────────────────────────────────────────────
  const lockKey  = `gen:${courseId}:${level}`;
  const lockToken = await acquireLock(lockKey, LOCK_TTL_SECS);
  if (!lockToken) {
    return res.status(409).json({
      message: 'Generation already in progress for this level. Please wait.',
    });
  }

  // ── 1b. Idempotency key — exactly-once within 5-minute window ─────────
  // Computed INSIDE the lock to prevent two identical retries from both
  // passing the check simultaneously before the first doc is written.
  const idempotencyKey = createHash('sha256')
    .update(`${courseId}|${level}|${(prompt || '').trim()}`)
    .digest('hex')
    .slice(0, 24);

  const idemWindow  = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS);
  const existingIdem = await AIContent.findOne({
    idempotencyKey,
    generationStatus: 'idle',
    createdAt:        { $gte: idemWindow },
  }).lean();

  if (existingIdem) {
    // Identical request already succeeded recently — return cached result
    await releaseLock(lockKey, lockToken);
    return res.json({
      message:          'Content already generated (idempotent — returning cached result)',
      level,
      version:          existingIdem.version,
      status:           existingIdem.status,
      generationStatus: 'idle',
      idempotent:       true,
      content:          toContentPayload(existingIdem),
    });
  }

  // ── 2. Heartbeat — renew lock every 15s so LLM > TTL can't race ──────
  const heartbeat = setInterval(
    () => extendLock(lockKey, lockToken, LOCK_TTL_SECS).catch(() => {}),
    HEARTBEAT_INTERVAL
  );

  let pendingDocId = null;
  let session      = null;

  try {
    // ── 3. Roadmap guard ────────────────────────────────────────────────
    const roadmap = await Roadmap.findOne({ courseId, isActive: true }).populate('steps').lean();
    if (!roadmap) {
      return res.status(400).json({
        message: 'No active roadmap found. Generate a roadmap first.',
      });
    }

    const step   = (roadmap.steps || []).find((s) => s.level === level);
    const course = await Course.findById(courseId).select('domain').lean();
    const domain = course?.domain || '';

    // ── 4. Previous level context ───────────────────────────────────────
    const levelIndex = LEVELS.indexOf(level);
    let prevLevelSummary = null;
    if (levelIndex > 0) {
      const prevDoc = await AIContent.findOne({
        courseId,
        level:  LEVELS[levelIndex - 1],
        status: 'published',
      }).select('content.explanation').lean();
      prevLevelSummary = prevDoc?.content?.explanation || null;
    }

    // ── 4a. Adaptive context from mentor's rating history ──────────────
    const adaptiveCtx = await getAdaptiveContext(courseId, level, req.user._id);
    const adaptiveHint = adaptiveCtx?.hint || null;

    // ── 5. Create pending doc (visible in DB before LLM begins) ────────
    await AIContent.updateMany(
      { courseId, level, isActive: true },
      { $set: { isActive: false } }
    );

    const last = await AIContent.findOne({ courseId, level })
      .sort({ version: -1 })
      .select('version')
      .lean();
    const newVersion = last ? last.version + 1 : 1;

    const pendingDoc = await AIContent.create({
      courseId,
      level,
      content:          { explanation: '', examples: [], resources: [] },
      version:          newVersion,
      status:           'draft',
      isActive:         true,
      generationStatus: 'generating',
      idempotencyKey,               // stored for future idempotency checks
      generatedBy:      req.user._id,
    });
    pendingDocId = pendingDoc._id;

    // ── 6. Clean LLM call + Validation ─────────────────────────────────
    const globalT0 = Date.now();
    const finalMentorPrompt = [prompt, adaptiveHint].filter(Boolean).join(' | ');
    const finalPrompt = buildContentPrompt({
      courseTitle: step?.title || '',
      level,
      step:        step?.description || '',
      mentorPrompt: finalMentorPrompt,
      prevContext: prevLevelSummary
    });

    let attempts = 0;
    let finalContent = null;
    let rawText = '';

    while (attempts < 2) {
      try {
         const result = await callLLM({ prompt: finalPrompt });
         if (result.negative) {
           console.warn(`[AI Controller] Negative cache skip`);
           break;
         }
         rawText = result.response || result || '';
         
         let parsed;
         try {
           parsed = JSON.parse(rawText.replace(/```json/gi, '').replace(/```/g, '').trim());
         } catch {
           throw new Error("Invalid JSON from LLM");
         }

         if (!validateContent(parsed)) {
           throw new Error("Invalid content structure");
         }
         
         finalContent = parsed;
         break;
      } catch (err) {
         console.warn(`[AI Controller] Non-stream attempt ${attempts+1} failed:`, err.message);
         attempts++;
      }
    }

    const usedFallback = !finalContent;
    if (usedFallback) {
      console.warn('[AI] Using fallback content after', attempts, 'attempts:', { courseId, level });
      finalContent = {
        explanation: `Fallback content for ${level} stage. The AI pipeline failed to maintain the structured requirements.`,
        examples: ["Apply concepts in a small project", "Review examples from documentation"],
        resources: [`Official documentation for this domain`, `YouTube resources for ${level}`]
      };
    }

    const result = {
       content: finalContent,
       usedFallback,
       circuitOpen: false,
       promptUsed: finalPrompt,
       durationMs: Date.now() - globalT0,
       attempts: attempts || 1,
       tokens: Math.ceil(rawText.length / 4)
    };

    // ── 8. Atomic: populate pending doc + emit event ───────────────────
    session = await mongoose.startSession();
    let doc;
    let eventObj;
    await session.withTransaction(async () => {
      doc = await AIContent.findByIdAndUpdate(
        pendingDocId,
        {
          $set: {
            'content.explanation':       result.content.explanation,
            'content.examples':          result.content.examples,
            'content.resources':         result.content.resources,
            generationStatus:            'idle',
            promptUsed:                  result.promptUsed,
            promptVersion:               PROMPT_VERSION,
            llmModel:                    process.env.OLLAMA_MODEL || 'llama3',
            'generationMeta.durationMs': result.durationMs,
            'generationMeta.tokens':     result.tokens,
            'generationMeta.attempts':   result.attempts,
          },
        },
        { new: true, session }
      );

      eventObj = await persistCourseEvent(
        'ai_content_generated',
        String(courseId),
        {
          courseId:  String(courseId),
          level,
          content:   toContentPayload(doc),
          updatedAt: doc.updatedAt,
        },
        auditFromRequest(req),
        session
      );
    });

    await deliverAndSnapshot(eventObj ? [eventObj] : []);

    // ── 9. Version retention — non-blocking, DB-level race protection ───
    enforceVersionRetention(courseId, level).catch((err) =>
      console.error('[Retention] Error:', err.message)
    );

    return res.json({
      message:          result.usedFallback
        ? `Content generated (${result.circuitOpen ? 'circuit open' : 'fallback used'})`
        : 'Content generated',
      level,
      version:          doc.version,
      status:           'draft',
      generationStatus: 'idle',
      usedFallback:     result.usedFallback,
      circuitOpen:      result.circuitOpen || false,
      attempts:         result.attempts,
      content:          toContentPayload(doc),
    });

  } catch (err) {
    if (pendingDocId) {
      AIContent.findByIdAndUpdate(pendingDocId, { $set: { generationStatus: 'failed' } }).catch(() => {});
    }
    if (err.message === 'GENERATION_TIMEOUT') {
      console.error('[generateLevelContent] Hard timeout exceeded (HARD_TIMEOUT_MS:', HARD_TIMEOUT_MS, 'ms)');
      return res.status(504).json({
        message: `AI generation timed out after ${HARD_TIMEOUT_MS / 1000}s. Please try again.`,
        code:    'GENERATION_TIMEOUT',
      });
    }
    console.error('[generateLevelContent]', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  } finally {
    clearInterval(heartbeat);                          // stop heartbeat first
    if (session) session.endSession().catch(() => {}); // then clean up session
    await releaseLock(lockKey, lockToken);             // release lock last
  }
};

/* ─── saveContent ────────────────────────────────────────────────────────── */
export const saveContent = async (req, res) => {
  try {
    if (!requireMentor(req, res)) return;
    const { courseId } = req.params;
    const { level, content } = req.body;

    if (!courseId || !mongoose.Types.ObjectId.isValid(courseId))
      return res.status(400).json({ message: 'Valid courseId is required' });
    if (!level || !LEVELS.includes(level))
      return res.status(400).json({ message: `level must be one of: ${LEVELS.join(', ')}` });
    if (!validateContent(content))
      return res.status(400).json({ message: 'content.explanation is required and must be non-empty' });

    const existing = await AIContent.findOne({ courseId, level, isActive: true });

    let doc;
    if (existing) {
      existing.content = {
        explanation: String(content.explanation).trim(),
        examples:    Array.isArray(content.examples)  ? content.examples.filter(Boolean)  : [],
        resources:   Array.isArray(content.resources) ? content.resources.filter(Boolean) : [],
      };
      existing.generatedBy      = req.user._id;
      existing.generationStatus = 'idle';
      doc = await existing.save();
    } else {
      await AIContent.updateMany({ courseId, level, isActive: true }, { $set: { isActive: false } });
      const last = await AIContent.findOne({ courseId, level }).sort({ version: -1 }).select('version').lean();
      doc = await AIContent.create({
        courseId, level,
        content: {
          explanation: String(content.explanation).trim(),
          examples:    Array.isArray(content.examples)  ? content.examples.filter(Boolean)  : [],
          resources:   Array.isArray(content.resources) ? content.resources.filter(Boolean) : [],
        },
        version:          last ? last.version + 1 : 1,
        status:           'draft',
        isActive:         true,
        generationStatus: 'idle',
        generatedBy:      req.user._id,
      });
    }

    return res.json({ message: 'Draft saved', level, version: doc.version, status: doc.status, content: toContentPayload(doc) });
  } catch (err) {
    console.error('[saveContent]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── publishContent ─────────────────────────────────────────────────────── */
export const publishContent = async (req, res) => {
  try {
    if (!requireMentor(req, res)) return;
    const { courseId } = req.params;
    const { level }    = req.body;

    if (!courseId) return res.status(400).json({ message: 'courseId is required' });
    if (!level || !LEVELS.includes(level))
      return res.status(400).json({ message: `level must be one of: ${LEVELS.join(', ')}` });

    const active = await AIContent.findOne({ courseId, level, isActive: true });
    if (!active) return res.status(404).json({ message: 'No active draft found. Generate or save content first.' });
    if (active.generationStatus === 'generating')
      return res.status(409).json({ message: 'Content is still generating. Wait for completion.' });

    await AIContent.updateMany({ courseId, level, status: 'published' }, { $set: { status: 'draft' } });
    active.status = 'published';
    await active.save();

    await emitCourseEvent('ai_content_published', String(courseId), {
      courseId: String(courseId), level, content: toContentPayload(active), updatedAt: active.updatedAt,
    }, auditFromRequest(req));

    return res.json({ message: 'Content published to mentee', level, version: active.version, status: 'published' });
  } catch (err) {
    console.error('[publishContent]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── getCourseLevelContent ─────────────────────────────────────────────── */
export const getCourseLevelContent = async (req, res) => {
  try {
    const { courseId } = req.params;
    const level = (req.query.level || 'beginner').toLowerCase();
    if (!courseId) return res.status(400).json({ message: 'courseId is required' });
    if (!LEVELS.includes(level)) return res.status(400).json({ message: 'Invalid level' });

    const isMentor = req.user?.role === 'mentor';
    const doc = isMentor
      ? await AIContent.findOne({ courseId, level, isActive: true }).lean()
      : await AIContent.findOne({ courseId, level, status: 'published' }).lean();

    return res.json({
      level,
      content:          doc ? toContentPayload(doc) : null,
      version:          doc?.version          ?? null,
      status:           doc?.status           ?? null,
      isActive:         doc?.isActive         ?? null,
      generationStatus: doc?.generationStatus ?? null,
      qualityScore:     doc?.qualityScore     ?? null,
      updatedAt:        doc?.updatedAt        ?? null,
    });
  } catch (err) {
    console.error('[getCourseLevelContent]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── getVersionHistory ─────────────────────────────────────────────────── */
export const getVersionHistory = async (req, res) => {
  try {
    if (!requireMentor(req, res)) return;
    const { courseId } = req.params;
    const level = (req.query.level || 'beginner').toLowerCase();
    if (!courseId) return res.status(400).json({ message: 'courseId is required' });
    if (!LEVELS.includes(level)) return res.status(400).json({ message: 'Invalid level' });

    const versions = await AIContent.find({ courseId, level })
      .sort({ version: -1 })
      .select('version status isActive generationStatus qualityScore generationMeta promptVersion updatedAt createdAt generatedBy llmModel')
      .lean();

    return res.json({ level, versions });
  } catch (err) {
    console.error('[getVersionHistory]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── rateContent ────────────────────────────────────────────────────────── */
export const rateContent = async (req, res) => {
  try {
    if (!requireMentor(req, res)) return;
    const { courseId } = req.params;
    const { level, score } = req.body;

    if (!courseId) return res.status(400).json({ message: 'courseId is required' });
    if (!level || !LEVELS.includes(level))
      return res.status(400).json({ message: `level must be one of: ${LEVELS.join(', ')}` });

    const parsedScore = Number(score);
    if (!Number.isInteger(parsedScore) || parsedScore < 1 || parsedScore > 5)
      return res.status(400).json({ message: 'score must be an integer 1–5' });

    const doc = await AIContent.findOneAndUpdate(
      { courseId, level, isActive: true },
      { $set: { qualityScore: parsedScore } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ message: 'No active draft found' });

    return res.json({ message: 'Quality score saved', level, version: doc.version, qualityScore: doc.qualityScore });
  } catch (err) {
    console.error('[rateContent]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── getMetrics ─────────────────────────────────────────────────────────── */
/**
 * GET /api/ai/metrics
 * Aggregates generation statistics from AIContent collection.
 * Admin or mentor only.
 */
export const getMetrics = async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== 'mentor' && role !== 'admin')
      return res.status(403).json({ message: 'Mentor or admin only' });

    const [agg] = await AIContent.aggregate([
      {
        $group: {
          _id:           null,
          totalVersions: { $sum: 1 },
          avgDurationMs: { $avg: '$generationMeta.durationMs' },
          totalAttempts: { $sum: '$generationMeta.attempts' },
          failedCount:   { $sum: { $cond: [{ $eq: ['$generationStatus', 'failed'] }, 1, 0] } },
          retryCount:    { $sum: { $cond: [{ $gt: ['$generationMeta.attempts', 1] }, 1, 0] } },
          avgQuality:    { $avg: '$qualityScore' },
          publishedCount:{ $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
        },
      },
    ]);

    const total = agg?.totalVersions || 0;

    return res.json({
      totalVersions:        total,
      publishedCount:       agg?.publishedCount || 0,
      avgGenerationTimeSec: agg?.avgDurationMs ? (agg.avgDurationMs / 1000).toFixed(2) : null,
      failureRate:          total ? `${((agg.failedCount / total) * 100).toFixed(1)}%` : '0%',
      retryRate:            total ? `${((agg.retryCount  / total) * 100).toFixed(1)}%` : '0%',
      totalRetries:         agg?.retryCount || 0,
      avgQualityScore:      agg?.avgQuality  ? Number(agg.avgQuality.toFixed(2)) : null,
      circuitBreaker:       llmCircuitBreaker.getStatus(),
      promptVersion:        PROMPT_VERSION,
      // IN-MEMORY METRICS:
      ...aiMetrics,
      cacheHitRate:         (aiMetrics.cacheHits + aiMetrics.groqCalls + aiMetrics.ollamaCalls) 
                            ? Number((aiMetrics.cacheHits / (aiMetrics.cacheHits + aiMetrics.groqCalls + aiMetrics.ollamaCalls)).toFixed(2)) 
                            : 0,
    });
  } catch (err) {
    console.error('[getMetrics]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── streamGenerate ──────────────────────────────────────────────────────
 * POST /api/ai/stream-level-content
 * body: { courseId, level, prompt? }
 *
 * Same lock / idempotency / circuit breaker guards as generateLevelContent.
 * Streams Ollama tokens to the client via Server-Sent Events in real-time.
 * Parses + validates the full JSON only when the stream completes, then saves.
 *
 * Client reads via fetch() + ReadableStream — see AIContentView.jsx.
 */
export const streamGenerate = async (req, res) => {
  const { courseId, level, prompt } = req.body;

  if (req.user?.role !== 'mentor')
    return res.status(403).json({ message: 'Mentor only' });
  if (!courseId || !mongoose.Types.ObjectId.isValid(courseId))
    return res.status(400).json({ message: 'Valid courseId is required' });
  if (!level || !LEVELS.includes(level))
    return res.status(400).json({ message: `level must be one of: ${LEVELS.join(', ')}` });

  const isChaos = process.env.CHAOS_MODE === 'true';
  const isTelemetry = req.query.telemetry === 'true';

  const promptHash = createHash('sha256').update((prompt || '').trim()).digest('hex');
  const idempotencyKey = createHash('sha256')
    .update(`${courseId}|${level}|${(prompt || '').trim()}`)
    .digest('hex').slice(0, 24);

  // ── Setup Resumable Session Cache ─────────────────────────────────────
  let reqLastId = req.headers['last-event-id'] ? parseInt(req.headers['last-event-id'], 10) : 0;
  let sessionObj = await getStreamSession(idempotencyKey);
  let isReconnect = false;
  
  if (!sessionObj) {
    sessionObj = { tokens: [], seq: 0, status: 'generating', startedAt: Date.now(), reconnects: 0, drops: 0 };
    await saveStreamSession(idempotencyKey, sessionObj);
  } else {
    isReconnect = true;
    sessionObj.reconnects = (sessionObj.reconnects || 0) + 1;
    await saveStreamSession(idempotencyKey, sessionObj);
  }

  // ── SSE headers ─────────────────────────────────────────────────────────
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx: disable proxy buffering
  
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Risk 3: Reattach race condition fix via single active connection map
  const activeResMap = req.app.locals.activeResMap = req.app.locals.activeResMap || new Map();
  if (activeResMap.has(idempotencyKey)) {
    activeResMap.get(idempotencyKey).end(); // Hard close old stream
  }
  activeResMap.set(idempotencyKey, res);

  const writeSSE = async (payload) => {
    if (!res.write(payload)) {
      await new Promise(r => res.once('drain', r));
    }
  };

  const unsub = subscribeStream(idempotencyKey, async (msg) => {
    try {
      const { seq, obj } = JSON.parse(msg);
      
      if (isChaos) {
        if (Math.random() < 0.05) await new Promise(r => setTimeout(r, 500)); // Delay
        if (Math.random() < 0.02 && activeResMap.get(idempotencyKey) === res) { res.end(); activeResMap.delete(idempotencyKey); } // Drop connection
        if (Math.random() < 0.05) await writeSSE(`id: ${seq}\ndata: ${JSON.stringify(obj)}\n\n`); // Duplicate frame
      }
      
      await writeSSE(`id: ${seq}\ndata: ${JSON.stringify(obj)}\n\n`);
      if (obj.type === 'complete' || obj.type === 'error') {
        if (activeResMap.get(idempotencyKey) === res) activeResMap.delete(idempotencyKey);
        res.end();
      }
    } catch {}
  });

  req.on('close', () => {
    if (activeResMap.get(idempotencyKey) === res) {
      activeResMap.delete(idempotencyKey);
      if (sessionObj.status === 'generating') {
        sessionObj.drops = (sessionObj.drops || 0) + 1;
        saveStreamSession(idempotencyKey, sessionObj).catch(() => {});
      }
    }
    unsub();
  });

  // Replay missed tokens if resuming
  if (reqLastId > 0 && reqLastId < sessionObj.seq) {
    const oldestSeq = Math.max(1, sessionObj.seq - sessionObj.tokens.length + 1);
    const startIdx = Math.max(0, reqLastId - oldestSeq + 1);
    
    for (let i = startIdx; i < sessionObj.tokens.length; i++) {
        const tokenSeq = oldestSeq + i;
        await writeSSE(`id: ${tokenSeq}\ndata: ${JSON.stringify({ type: 'token', text: sessionObj.tokens[i] })}\n\n`);
    }
  }

  // Idempotency / early exit if completed
  if (sessionObj.status !== 'generating') {
     if (sessionObj.finalEvent) {
        await writeSSE(`id: ${sessionObj.seq + 1}\ndata: ${JSON.stringify(sessionObj.finalEvent)}\n\n`);
     }
     if (activeResMap.get(idempotencyKey) === res) activeResMap.delete(idempotencyKey);
     return res.end();
  }

  // ── Distributed lock ────────────────────────────────────────────────────
  const lockKey  = `gen:${courseId}:${level}`;
  const lockToken = await acquireLock(lockKey, LOCK_TTL_SECS);
  if (!lockToken) {
    if (isReconnect) {
      return; // background process holds lock; subscriber receives events via PubSub
    }
    await writeSSE(`data: ${JSON.stringify({ type: 'error', message: 'Generation already in progress. Please wait.', code: 'LOCKED' })}\n\n`);
    return res.end();
  }

  const heartbeat = setInterval(
    () => extendLock(lockKey, lockToken, LOCK_TTL_SECS).catch(() => {}),
    HEARTBEAT_INTERVAL
  );

  let pendingDocId = null;
  let session      = null;

  try {
    // ── Roadmap guard ───────────────────────────────────────────────────
    const roadmap = await Roadmap.findOne({ courseId, isActive: true }).lean();
    if (!roadmap) return sendError('No active roadmap. Generate a roadmap first.', 'NO_ROADMAP');

    const course = await Course.findById(courseId).select('domain').lean();
    const domain = course?.domain || '';
    const step   = (roadmap.steps || []).find((s) => s.level === level);

    // ── Previous level context ──────────────────────────────────────────
    const levelIndex = LEVELS.indexOf(level);
    let prevLevelSummary = null;
    if (levelIndex > 0) {
      const prevDoc = await AIContent.findOne({
        courseId, level: LEVELS[levelIndex - 1], status: 'published',
      }).select('content.explanation').lean();
      prevLevelSummary = prevDoc?.content?.explanation || null;
    }

    // ── Adaptive context ────────────────────────────────────────────────
    const adaptiveCtx  = await getAdaptiveContext(courseId, level, req.user._id);
    const adaptiveHint = adaptiveCtx?.hint || null;

    // ── Create pending doc ──────────────────────────────────────────────
    await AIContent.updateMany({ courseId, level, isActive: true }, { $set: { isActive: false } });
    const last = await AIContent.findOne({ courseId, level }).sort({ version: -1 }).select('version').lean();
    const newVersion = last ? last.version + 1 : 1;

    const pendingDoc = await AIContent.create({
      courseId, level,
      content: { explanation: '', examples: [], resources: [] },
      version: newVersion, status: 'draft', isActive: true,
      generationStatus: 'generating', idempotencyKey,
      generatedBy: req.user._id,
    });
    pendingDocId = pendingDoc._id;

    // ── Build prompt ────────────────────────────────────────────────────
    const finalMentorPrompt = [prompt, adaptiveHint].filter(Boolean).join(' | ');
    const finalPrompt = buildContentPrompt({
      courseTitle: step?.title || '',
      level,
      step:        step?.description || '',
      mentorPrompt: finalMentorPrompt,
      prevContext: prevLevelSummary
    });

    // ── Generator functions ──────────────────────────────────────────────
    let currentSeq = sessionObj.seq;
    let batchCounter = 0;

    const emitLive = async (obj) => {
      let emitSeq = currentSeq;
      if (obj.type === 'token') {
        sessionObj.tokens.push(obj.text);
        currentSeq++;
        emitSeq = currentSeq;
      } else {
        emitSeq = currentSeq + 1;
      }

      await publishStreamEvent(idempotencyKey, { seq: emitSeq, obj });

      if (obj.type === 'token') {
        batchCounter++;
        if (batchCounter > 20) {
          batchCounter = 0;
          sessionObj.seq = currentSeq;
          await saveStreamSession(idempotencyKey, sessionObj);
        }
      }
    };

    const abortController = new AbortController();

    let fullText = '';
    const started = Date.now();
    try {
      const responseStream = await callLLM({ 
        prompt: finalPrompt, 
        stream: true, 
        signal: abortController.signal,
        courseId,
        level,
        promptVersion: PROMPT_VERSION
      });
      
      if (responseStream.negative) {
         return await emitLive({ type: 'error', message: 'Content dropped (failed cache match)', code: 'NEGATIVE_CACHE' });
      }

      // ── Stream tokens via SSE ───────────────────────────────────────────
      await emitLive({ 
        type: 'start', 
        version: newVersion, 
        level,
        source: responseStream.source || "ollama"
      });

      const reader = responseStream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // save incomplete line

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const chunk = JSON.parse(trimmed);
            const token = chunk.response || '';
            if (token) {
              fullText += token;
              await emitLive({ type: 'token', text: token });
              
              if (token.includes('"examples"')) await emitLive({ type: 'section_done', section: 'explanation' });
              if (token.includes('"resources"')) await emitLive({ type: 'section_done', section: 'examples' });
              
              if (isTelemetry && currentSeq % 10 === 0) {
                 const elapsed = Date.now() - sessionObj.startedAt;
                 await emitLive({ type: 'telemetry', elapsedMs: elapsed, tokensPerSec: (currentSeq / (elapsed / 1000)).toFixed(1) });
              }
            }
            if (chunk.done) break;
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') throw err;
    }

    if (abortController.signal.aborted) {
      return; 
    }

    if (!fullText) {
      await AIContent.findByIdAndUpdate(pendingDocId, { $set: { generationStatus: 'failed' } });
      return await emitLive({ type: 'error', message: 'LLM stream returned no content. Please try again.', code: 'EMPTY_RESPONSE' });
    }

    // ── Safe JSON validation against schema ─────────────────────────────────
    let parsed;
    let usedFallback = false;
    try {
      parsed = JSON.parse(fullText.replace(/```json/gi, '').replace(/```/g, '').trim());
      if (!validateContent(parsed)) {
        throw new Error("Invalid content structure");
      }
    } catch (err) {
      console.error('[AI JSON ERROR]', fullText);
      usedFallback = true;
      parsed = {
        explanation: `Fallback content deployed. The streaming LLM logic encountered a corruption error.`,
        examples: ["Fallback streaming task A", "Fallback streaming task B"],
        resources: ["Base Documentation"]
      };
    }

    const durationMs = Date.now() - started;

    // ── Atomic persist + event ──────────────────────────────────────────
    session = await mongoose.startSession();
    let savedDoc;
    await session.withTransaction(async () => {
      savedDoc = await AIContent.findByIdAndUpdate(
        pendingDocId,
        {
          $set: {
            'content.explanation':       parsed.explanation,
            'content.examples':          parsed.examples,
            'content.resources':         parsed.resources,
            generationStatus:            'idle',
            promptUsed:                  finalPrompt,
            promptVersion:               PROMPT_VERSION,
            llmModel:                    process.env.OLLAMA_MODEL || 'llama3',
            'generationMeta.durationMs': durationMs,
            'generationMeta.tokens':     Math.ceil(fullText.length / 4),
            'generationMeta.attempts':   1,
            'generationMeta.tokensPerSec': Number((Math.ceil(fullText.length / 4) / (durationMs / 1000)).toFixed(1)) || 0,
            'generationMeta.reconnects': sessionObj.reconnects || 0,
            'generationMeta.drops':      sessionObj.drops || 0,
          },
        },
        { new: true, session }
      );

      await persistCourseEvent(
        'ai_content_generated', String(courseId),
        { courseId: String(courseId), level, content: parsed, updatedAt: savedDoc.updatedAt },
        auditFromRequest(req), session
      );
    });

    enforceVersionRetention(courseId, level).catch(() => {});

    // ── Final SSE event — triggers frontend state update ────────────────
    const finalEvent = {
      type:    'complete',
      version: savedDoc.version,
      status:  'draft',
      valid:   !usedFallback,
      source:  responseStream?.source || 'ollama',
      cached:  responseStream?.isCache === true,
      content: toContentPayload(savedDoc),
      durationMs,
    };
    
    sessionObj.status = 'completed';
    sessionObj.finalEvent = finalEvent;
    sessionObj.seq = currentSeq;
    await saveStreamSession(idempotencyKey, sessionObj);

    await emitLive(finalEvent);

  } catch (err) {
    console.error('[streamGenerate]', err);
    if (pendingDocId) {
      await AIContent.findByIdAndUpdate(pendingDocId, { $set: { generationStatus: 'failed' } });
    }
    
    sessionObj.status = 'failed';
    const errEvent = { type: 'error', message: 'Server error during stream', code: 'SERVER_ERROR' };
    sessionObj.finalEvent = errEvent;
    await saveStreamSession(idempotencyKey, sessionObj);
    
    await publishStreamEvent(idempotencyKey, { seq: sessionObj.seq + 1, obj: errEvent });

  } finally {
    clearInterval(heartbeat);
    if (session) session.endSession().catch(() => {});
    await releaseLock(lockKey, lockToken);
  }
};

/* ─── getMentorMetrics ────────────────────────────────────────────────────
 * GET /api/ai/metrics/mentor/:mentorId
 * Aggregates per-mentor AI generation stats.
 * Accessible by: the mentor themselves, or any admin.
 */
export const getMentorMetrics = async (req, res) => {
  try {
    const { mentorId } = req.params;
    const role = req.user?.role;
    if (role !== 'admin' && req.user?._id?.toString() !== mentorId)
      return res.status(403).json({ message: 'Forbidden' });
    if (!mentorId || !mongoose.Types.ObjectId.isValid(mentorId))
      return res.status(400).json({ message: 'Valid mentorId required' });

    const [agg] = await AIContent.aggregate([
      { $match: { generatedBy: new mongoose.Types.ObjectId(mentorId) } },
      {
        $group: {
          _id:              null,
          totalVersions:    { $sum: 1 },
          avgQuality:       { $avg: '$qualityScore' },
          avgDurationMs:    { $avg: '$generationMeta.durationMs' },
          failedCount:      { $sum: { $cond: [{ $eq: ['$generationStatus', 'failed'] }, 1, 0] } },
          retryCount:       { $sum: { $cond: [{ $gt: ['$generationMeta.attempts', 1] }, 1, 0] } },
          publishedCount:   { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
          highQualityCount: { $sum: { $cond: [{ $gte: ['$qualityScore', 4] }, 1, 0] } },
        },
      },
    ]);

    const total = agg?.totalVersions || 0;
    return res.json({
      mentorId,
      totalVersions:   total,
      publishedCount:  agg?.publishedCount   || 0,
      successRate:     total ? `${(((total - (agg?.failedCount || 0)) / total) * 100).toFixed(1)}%` : '100%',
      failureRate:     total ? `${((agg.failedCount / total) * 100).toFixed(1)}%` : '0%',
      retryRate:       total ? `${((agg.retryCount  / total) * 100).toFixed(1)}%` : '0%',
      avgQualityScore: agg?.avgQuality  ? Number(agg.avgQuality.toFixed(2)) : null,
      highQualityRate: total ? `${((agg.highQualityCount / total) * 100).toFixed(1)}%` : '0%',
      avgGenTimeSec:   agg?.avgDurationMs ? (agg.avgDurationMs / 1000).toFixed(2) : null,
    });
  } catch (err) {
    console.error('[getMentorMetrics]', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

/* ─── Legacy shim ────────────────────────────────────────────────────────
 */
export const publishLevelContent = async (req, res) => {
  req.params.courseId = req.body.courseId;
  return publishContent(req, res);
};
