import Course from '../models/Course.js';
import RealtimeEvent from '../models/RealtimeEvent.js';
import CourseSnapshot from '../models/CourseSnapshot.js';
import { buildSyncSnapshot } from '../services/realtimeSnapshotService.js';
import { metrics } from '../observability/metrics.js';
import { logger } from '../observability/logger.js';
import { logSyncRecovery } from '../observability/interviewLog.js';
import { getRealtimeIO } from '../socket/realtime.js';
import { deliverCourseEvent } from '../socket/eventBuilder.js';

async function assertCourseMember(courseId, userId) {
  const course = await Course.findById(courseId)
    .select('mentor mentorId mentee menteeId mentorshipId progress realtimeVersion')
    .lean();
  if (!course) return null;
  const uid = String(userId);
  const mentorId = String(course.mentor?._id || course.mentor || course.mentorId || '');
  const menteeId = String(course.mentee?._id || course.mentee || course.menteeId || '');
  if (uid !== mentorId && uid !== menteeId) return null;
  return course;
}

export const syncRealtime = async (req, res) => {
  const t0 = Date.now();
  try {
    metrics.inc('sync_api_calls');
    const { courseId, lastVersion } = req.query;
    if (!courseId) return res.status(400).json({ message: 'courseId is required' });

    const course = await assertCourseMember(courseId, req.user._id);
    if (!course) return res.status(403).json({ message: 'Not authorized' });

    const numericLastVersion = Math.max(0, Number(lastVersion || 0));
    const events = await RealtimeEvent.find({
      courseId,
      version: { $gt: numericLastVersion },
    })
      .sort({ version: 1 })
      .limit(200)
      .lean();

    const courseV = Number(course.realtimeVersion || 0);
    const snapDoc = await CourseSnapshot.findOne({ courseId, realtimeVersion: courseV }).lean();

    let snapshot;
    if (snapDoc?.snapshot) {
      snapshot = snapDoc.snapshot;
    } else {
      snapshot = await buildSyncSnapshot(courseId);
    }

    const latency = Date.now() - t0;
    logSyncRecovery({
      courseId: String(courseId),
      lastVersion: numericLastVersion,
      latencyMs: latency,
      eventCount: events.length,
    });
    metrics.recordEmitLatency(latency);

    return res.json({
      courseId: String(courseId),
      currentVersion: courseV,
      events: events.map((evt) => ({
        eventId: evt.eventId,
        version: evt.version,
        type: evt.type,
        courseId: String(evt.courseId),
        timestamp: evt.timestamp,
        payload: evt.payload || {},
        actorId: evt.actorId,
        actorRole: evt.actorRole,
        actionSource: evt.actionSource,
      })),
      snapshot,
    });
  } catch (err) {
    console.error('syncRealtime failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getRealtimeMetrics = (req, res) => {
  return res.json(metrics.snapshot());
};

function collectSocketStats() {
  const io = getRealtimeIO();
  let engineClients = 0;
  const mentorshipRooms = {};
  try {
    engineClients = io?.engine?.clientsCount ?? 0;
    const rooms = io?.sockets?.adapter?.rooms;
    if (rooms && typeof rooms.forEach === 'function') {
      rooms.forEach((set, name) => {
        const s = String(name);
        if (s.startsWith('mentorship_')) {
          mentorshipRooms[s] = set.size;
        }
      });
    }
  } catch {
    /* ignore */
  }
  const activeMentorshipRooms = Object.keys(mentorshipRooms).length;
  return { engineClients, activeMentorshipRooms, mentorshipRooms };
}

export const getOpsDashboard = (req, res) => {
  const socketStats = collectSocketStats();
  return res.json({
    ...metrics.snapshot(),
    sockets: socketStats,
    redis: Boolean(process.env.REDIS_URL),
    uptimeSec: Math.round(process.uptime()),
  });
};

export const getEventTimeline = async (req, res) => {
  try {
    const { courseId } = req.params;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const course = await assertCourseMember(courseId, req.user._id);
    if (!course) return res.status(403).json({ message: 'Not authorized' });

    const events = await RealtimeEvent.find({ courseId })
      .sort({ version: -1 })
      .limit(limit)
      .lean();

    return res.json({
      courseId: String(courseId),
      currentVersion: Number(course.realtimeVersion || 0),
      events: events.map((evt) => ({
        eventId: evt.eventId,
        version: evt.version,
        type: evt.type,
        timestamp: evt.timestamp,
        actorId: evt.actorId,
        actorRole: evt.actorRole,
        actionSource: evt.actionSource,
        payload: evt.payload || {},
      })),
    });
  } catch (err) {
    console.error('getEventTimeline failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const exportCourseState = async (req, res) => {
  try {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ message: 'courseId is required' });
    const course = await assertCourseMember(courseId, req.user._id);
    if (!course) return res.status(403).json({ message: 'Not authorized' });

    const snapshot = await buildSyncSnapshot(courseId);
    const history = await RealtimeEvent.find({ courseId })
      .sort({ version: 1 })
      .limit(2000)
      .lean();

    return res.json({
      exportedAt: new Date().toISOString(),
      courseId: String(courseId),
      realtimeVersion: Number(course.realtimeVersion || 0),
      snapshot,
      eventHistory: history.map((e) => ({
        eventId: e.eventId,
        version: e.version,
        type: e.type,
        timestamp: e.timestamp,
        actorId: e.actorId,
        actorRole: e.actorRole,
        actionSource: e.actionSource,
        payload: e.payload,
      })),
    });
  } catch (err) {
    console.error('exportCourseState failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getStateAtVersion = async (req, res) => {
  try {
    const { courseId } = req.query;
    const atVersion = Number(req.query.version);
    if (!courseId || !Number.isFinite(atVersion)) {
      return res.status(400).json({ message: 'courseId and version are required' });
    }
    const course = await assertCourseMember(courseId, req.user._id);
    if (!course) return res.status(403).json({ message: 'Not authorized' });

    const baseline = await CourseSnapshot.findOne({
      courseId,
      realtimeVersion: { $lte: atVersion },
    })
      .sort({ realtimeVersion: -1 })
      .lean();

    const eventsThrough = await RealtimeEvent.find({
      courseId,
      version: { $lte: atVersion },
    })
      .sort({ version: 1 })
      .lean();

    const currentLive = await buildSyncSnapshot(courseId);

    return res.json({
      courseId: String(courseId),
      requestedVersion: atVersion,
      currentCourseVersion: Number(course.realtimeVersion || 0),
      note:
        'baselineSnapshot is the latest stored snapshot at or before requestedVersion; eventsThrough lists persisted events up to that version. Full deterministic fold requires a client-side reducer (future work).',
      baselineSnapshot: baseline?.snapshot || null,
      baselineSnapshotVersion: baseline?.realtimeVersion ?? null,
      eventsThrough: eventsThrough.map((e) => ({
        eventId: e.eventId,
        version: e.version,
        type: e.type,
        timestamp: e.timestamp,
        actorId: e.actorId,
        actorRole: e.actorRole,
        actionSource: e.actionSource,
        payload: e.payload,
      })),
      currentLiveSnapshot: currentLive,
    });
  } catch (err) {
    console.error('getStateAtVersion failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const replayEventToRoom = async (req, res) => {
  try {
    const { eventId, courseId } = req.body;
    if (!eventId || !courseId) {
      return res.status(400).json({ message: 'eventId and courseId are required' });
    }
    const course = await assertCourseMember(courseId, req.user._id);
    if (!course) return res.status(403).json({ message: 'Not authorized' });

    const evt = await RealtimeEvent.findOne({ eventId, courseId }).lean();
    if (!evt) return res.status(404).json({ message: 'Event not found' });

    const event = {
      eventId: evt.eventId,
      version: evt.version,
      courseId: String(courseId),
      type: evt.type,
      payload: evt.payload || {},
      timestamp: new Date(evt.timestamp).toISOString(),
      actorId: evt.actorId,
      actorRole: evt.actorRole,
      actionSource: evt.actionSource || 'system',
    };
    await deliverCourseEvent(event);
    metrics.inc('replay_emits');
    logger.info('replay_emit', { eventId, courseId: String(courseId) });
    return res.json({ message: 'Re-emitted to course room', eventId });
  } catch (err) {
    console.error('replayEventToRoom failed:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};
