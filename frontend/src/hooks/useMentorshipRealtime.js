import { useEffect, useMemo, useRef, useState } from 'react'
import { connectSocket, getSocket } from '../socket'
import api from '../utils/api'

export default function useMentorshipRealtime(courseId) {
  const [events, setEvents] = useState({
    roadmapCreated: null,
    aiContentPublished: null,
    taskCreated: null,
    taskCompleted: null,
    progressUpdated: null,
    levelUpdated: null,
    version: 0,
    snapshot: null,
  })
  const seenEventIds = useRef(new Set())
  const seenEventQueue = useRef([])
  const versionRef = useRef(0)

  const normalizedCourseId = useMemo(() => String(courseId || ''), [courseId])

  useEffect(() => {
    if (!normalizedCourseId) return
    connectSocket()
    const socket = getSocket()
    const roomPayload = { courseId: normalizedCourseId }
    const joinCourseRoom = () => socket.emit('join_course_room', roomPayload)
    joinCourseRoom()

    const rememberEventId = (eventId) => {
      if (!eventId) return false
      if (seenEventIds.current.has(eventId)) return false
      seenEventIds.current.add(eventId)
      seenEventQueue.current.push(eventId)
      if (seenEventQueue.current.length > 500) {
        const old = seenEventQueue.current.shift()
        if (old) seenEventIds.current.delete(old)
      }
      return true
    }

    const syncFromServer = async () => {
      try {
        const res = await api.get('/api/realtime/sync', {
          params: { courseId: normalizedCourseId, lastVersion: versionRef.current || 0 },
        })
        const data = res.data || {}
        if (Array.isArray(data.events)) {
          data.events.forEach((evt) => applyNormalizedEvent(evt, { strict: false }))
        }
        if (data.snapshot) {
          setEvents((prev) => ({
            ...prev,
            roadmapCreated: data.snapshot.roadmap
              ? {
                  courseId: normalizedCourseId,
                  roadmap: data.snapshot.roadmap,
                  version: Number(data.currentVersion || prev.version || 0),
                  timestamp: new Date().toISOString(),
                }
              : prev.roadmapCreated,
            snapshot: data.snapshot,
            version: Math.max(Number(prev.version || 0), Number(data.currentVersion || 0)),
          }))
          versionRef.current = Math.max(Number(versionRef.current || 0), Number(data.currentVersion || 0))
        }
      } catch (err) {
        console.error('Realtime sync failed:', err)
      }
    }

    const applyNormalizedEvent = (event, options = {}) => {
      const strict = options.strict !== false
      if (!event || String(event.courseId || '') !== normalizedCourseId) return
      if (!rememberEventId(event.eventId)) {
        console.info(JSON.stringify({ tag: 'event_dropped', reason: 'duplicate', eventId: event.eventId }))
        return
      }

      const v = Number(event.version || 0)
      const cur = Number(versionRef.current || 0)

      if (strict) {
        if (v > cur + 1) {
          console.info(JSON.stringify({ tag: 'version_gap', received: v, current: cur }))
          void syncFromServer()
          return
        }
        if (v !== cur + 1) {
          console.info(
            JSON.stringify({
              tag: 'event_dropped',
              reason: 'non_sequential',
              eventId: event.eventId,
              version: v,
              expected: cur + 1,
            })
          )
          return
        }
      } else if (v <= cur) {
        console.info(JSON.stringify({ tag: 'event_dropped', reason: 'outdated', eventId: event.eventId, version: v }))
        return
      }

      versionRef.current = strict ? v : Math.max(cur, v)
      console.info(JSON.stringify({ tag: 'event_received', eventId: event.eventId, type: event.type, version: event.version }))
      setEvents((prev) => {
        const next = { ...prev, version: versionRef.current }
        if (event.type === 'roadmap_created') next.roadmapCreated = { ...event.payload, ...event }
        if (event.type === 'ai_content_published') next.aiContentPublished = { ...event.payload, ...event }
        if (event.type === 'task_created') next.taskCreated = { ...event.payload, ...event }
        if (event.type === 'task_completed') next.taskCompleted = { ...event.payload, ...event }
        if (event.type === 'progress_updated') next.progressUpdated = { ...event.payload, ...event }
        if (event.type === 'level_updated') next.levelUpdated = { ...event.payload, ...event }
        return next
      })
    }

    const onCourseEvent = (event) => applyNormalizedEvent(event, { strict: true })
    const onCourseEventBatch = (list) => {
      if (!Array.isArray(list)) return
      for (const ev of list) {
        applyNormalizedEvent(ev, { strict: true })
      }
    }
    const onConnect = () => {
      joinCourseRoom()
      syncFromServer()
    }
    const onReconnect = () => {
      socket.emit('mentorship_realtime_reconnect_ack')
      joinCourseRoom()
      syncFromServer()
    }
    socket.on('course_event', onCourseEvent)
    socket.on('course_events_batch', onCourseEventBatch)
    socket.on('connect', onConnect)
    socket.on('reconnect', onReconnect)
    syncFromServer()

    return () => {
      socket.off('course_event', onCourseEvent)
      socket.off('course_events_batch', onCourseEventBatch)
      socket.off('connect', onConnect)
      socket.off('reconnect', onReconnect)
      socket.emit('leave_course_room', roomPayload)
    }
  }, [normalizedCourseId])

  return events
}
