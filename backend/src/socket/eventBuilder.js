import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import Course from '../models/Course.js';
import RealtimeEvent from '../models/RealtimeEvent.js';
import CourseSnapshot from '../models/CourseSnapshot.js';
import { emitMentorshipCourseEvent, emitMentorshipCourseEventBatch } from './realtime.js';
import { logger } from '../observability/logger.js';
import { metrics } from '../observability/metrics.js';
import {
  chaosMaybeDelayEmit,
  chaosMaybeDropEmit,
  chaosMaybeReorderHint,
  chaosMaybeDuplicateEmit,
} from '../observability/chaos.js';
import { logSystemEvent } from '../observability/interviewLog.js';
import { transactionsMandatory } from '../config/replicaSet.js';
import { invalidateCourseCache } from '../services/realtimeCache.js';

const SNAPSHOT_EVERY_N_EVENTS = Math.max(1, Number(process.env.REALTIME_SNAPSHOT_INTERVAL || 10));
const REALTIME_BATCH_MS = Math.max(0, Number(process.env.REALTIME_EVENT_BATCH_MS ?? 70));

const PAYLOAD_KEYS = {
  roadmap_created: ['courseId', 'roadmap'],
  ai_content_generated: ['courseId', 'level', 'content', 'updatedAt'],
  ai_content_published: ['courseId', 'level', 'content', 'updatedAt'],
  task_created: ['courseId', 'level', 'task'],
  task_completed: ['courseId', 'taskId', 'updatedProgress', 'task'],
  progress_updated: ['courseId', 'level', 'levelProgress', 'overallProgress', 'currentLevel'],
  level_updated: ['courseId', 'currentLevel'],
};

const pendingDeliver = new Map();

function pickPayload(type, payload) {
  const allowed = PAYLOAD_KEYS[type];
  if (!allowed) return { ...payload };
  const out = {};
  for (const key of allowed) {
    if (payload[key] !== undefined) out[key] = payload[key];
  }
  return out;
}

function validatePayload(type, payload) {
  if (!PAYLOAD_KEYS[type]) return true;
  if (payload.courseId === undefined || payload.courseId === null) return false;
  return true;
}

/**
 * Persist one version increment + RealtimeEvent row (optionally inside a transaction session).
 * Does NOT emit to Socket.IO — call deliverCourseEvent after commit.
 */
export async function persistCourseEvent(type, courseId, rawPayload, audit = {}, session = null) {
  if (!validatePayload(type, rawPayload)) {
    throw new Error(`Invalid payload for event type ${type}`);
  }
  const payload = pickPayload(type, rawPayload);
  const t0 = Date.now();

  const updateOptions = { new: true, select: 'realtimeVersion', lean: true };
  if (session) updateOptions.session = session;

  const updatedCourse = await Course.findByIdAndUpdate(
    courseId,
    { $inc: { realtimeVersion: 1 } },
    updateOptions
  );

  if (!updatedCourse) {
    throw new Error('Course not found while building realtime event');
  }

  const event = {
    eventId: randomUUID(),
    version: Number(updatedCourse.realtimeVersion || 0),
    courseId: String(courseId),
    type,
    payload,
    timestamp: new Date().toISOString(),
    actorId: audit.actorId || null,
    actorRole: audit.actorRole || '',
    actionSource: audit.actionSource || 'system',
  };

  const doc = {
    eventId: event.eventId,
    version: event.version,
    courseId,
    type: event.type,
    payload: event.payload,
    timestamp: new Date(event.timestamp),
    actorId: audit.actorId || null,
    actorRole: audit.actorRole || '',
    actionSource: audit.actionSource || 'system',
  };

  if (session) {
    await RealtimeEvent.create([doc], { session });
  } else {
    await RealtimeEvent.create(doc);
  }

  metrics.recordEmitLatency(Date.now() - t0);
  return event;
}

async function emitOneSocketPattern(courseId, event) {
  const mergedPayload = { ...event.payload, ...event };
  const t0 = Date.now();
  if (chaosMaybeReorderHint()) {
    metrics.inc('chaos_reordered_emits');
    emitMentorshipCourseEvent(courseId, 'course_event', event);
    emitMentorshipCourseEvent(courseId, event.type, mergedPayload);
  } else {
    emitMentorshipCourseEvent(courseId, event.type, mergedPayload);
    emitMentorshipCourseEvent(courseId, 'course_event', event);
  }
  if (chaosMaybeDuplicateEmit()) {
    metrics.inc('chaos_duplicate_emits');
    emitMentorshipCourseEvent(courseId, 'course_event', event);
  }
  metrics.recordEmitLatency(Date.now() - t0);
  metrics.recordEventEmit();
  logger.info('event_emitted', {
    eventId: event.eventId,
    type: event.type,
    version: event.version,
    courseId: String(courseId),
  });
  logSystemEvent('socket_emit', { eventId: event.eventId, type: event.type, version: event.version });
}

/**
 * Low-level socket fan-out for one or more persisted events (same course or multiple).
 */
export async function emitEventsForSocket(events) {
  if (!events?.length) return;
  const byCourse = new Map();
  for (const ev of events) {
    const cid = String(ev.courseId);
    if (!byCourse.has(cid)) byCourse.set(cid, []);
    byCourse.get(cid).push(ev);
  }

  for (const [courseId, list] of byCourse) {
    const survivors = [];
    for (const event of list) {
      await chaosMaybeDelayEmit();
      if (chaosMaybeDropEmit()) {
        metrics.inc('dropped_events_chaos');
        logSystemEvent('chaos_emit_dropped', { eventId: event.eventId, type: event.type });
        continue;
      }
      survivors.push(event);
    }
    if (!survivors.length) continue;

    if (survivors.length === 1) {
      await emitOneSocketPattern(courseId, survivors[0]);
    } else {
      const t0 = Date.now();
      emitMentorshipCourseEventBatch(courseId, survivors);
      metrics.recordEmitLatency(Date.now() - t0);
      for (const event of survivors) {
        metrics.recordEventEmit();
        logger.info('event_emitted', {
          eventId: event.eventId,
          type: event.type,
          version: event.version,
          courseId: String(courseId),
        });
        logSystemEvent('socket_emit', { eventId: event.eventId, type: event.type, version: event.version });
      }
    }
    invalidateCourseCache(courseId);
  }
}

function flushPendingBatch(courseId) {
  const b = pendingDeliver.get(courseId);
  if (!b?.events?.length) return;
  const list = b.events;
  pendingDeliver.delete(courseId);
  if (b.timer) clearTimeout(b.timer);
  void (async () => {
    await emitEventsForSocket(list);
    for (const ev of list) {
      void maybeWriteSnapshot(ev.courseId, ev.version);
    }
  })();
}

export async function deliverCourseEvent(event) {
  if (!event) return;
  if (REALTIME_BATCH_MS > 0) {
    let b = pendingDeliver.get(String(event.courseId));
    if (!b) {
      b = { events: [], timer: null };
      pendingDeliver.set(String(event.courseId), b);
    }
    b.events.push(event);
    if (b.timer) clearTimeout(b.timer);
    b.timer = setTimeout(() => flushPendingBatch(String(event.courseId)), REALTIME_BATCH_MS);
    return;
  }
  await emitEventsForSocket([event]);
}

export async function maybeWriteSnapshot(courseId, version) {
  if (version % SNAPSHOT_EVERY_N_EVENTS !== 0) return;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const c = await Course.findById(courseId).select('realtimeVersion').lean();
      if (!c || Number(c.realtimeVersion) !== version) {
        if (attempt === 0) await new Promise((r) => setTimeout(r, 40));
        continue;
      }
      const { buildSyncSnapshot } = await import('../services/realtimeSnapshotService.js');
      const snapshot = await buildSyncSnapshot(courseId);
      await CourseSnapshot.findOneAndUpdate(
        { courseId, realtimeVersion: version },
        { courseId, realtimeVersion: version, snapshot },
        { upsert: true, new: true }
      );
      return;
    } catch (err) {
      logger.warn('snapshot_write_skipped', { courseId: String(courseId), message: err.message });
      return;
    }
  }
}

/**
 * Single persisted event + socket delivery (after DB commit).
 */
export async function emitCourseEvent(type, courseId, rawPayload, audit = {}) {
  const event = await persistCourseEvent(type, courseId, rawPayload, audit, null);
  await deliverCourseEvent(event);
  if (REALTIME_BATCH_MS <= 0) {
    void maybeWriteSnapshot(courseId, event.version);
  }
  return event;
}

/**
 * Multiple events in one MongoDB transaction; socket delivery only after successful commit.
 */
export async function emitCourseEventsTransactional(operations, audit = {}) {
  if (!operations?.length) return [];
  const session = await mongoose.startSession();
  const events = [];
  try {
    await session.withTransaction(async () => {
      for (const op of operations) {
        const ev = await persistCourseEvent(op.type, op.courseId, op.payload, audit, session);
        events.push(ev);
      }
    });
    await deliverAndSnapshot(events);
    return events;
  } catch (err) {
    if (transactionsMandatory()) {
      logger.error('transactional_events_failed', { message: err.message });
      throw err;
    }
    logger.warn('transactional_events_fallback', { message: err.message });
    const out = [];
    for (const op of operations) {
      const ev = await emitCourseEvent(op.type, op.courseId, op.payload, audit);
      out.push(ev);
    }
    return out;
  } finally {
    await session.endSession();
  }
}

export async function deliverAndSnapshot(events) {
  if (!events?.length) return;
  await emitEventsForSocket(events);
  for (const ev of events) {
    void maybeWriteSnapshot(ev.courseId, ev.version);
  }
}
