let ioInstance = null

export function setRealtimeIO(io) {
  ioInstance = io
}

export function getRealtimeIO() {
  return ioInstance
}

export function mentorshipCourseRoom(courseId) {
  return `mentorship_${courseId}`
}

export function emitMentorshipCourseEvent(courseId, eventName, payload) {
  if (!ioInstance || !courseId || !eventName) return
  ioInstance.to(mentorshipCourseRoom(courseId)).emit(eventName, payload)
}

/** Batched envelopes (same shape as individual `course_event` payloads). */
export function emitMentorshipCourseEventBatch(courseId, courseEvents) {
  if (!ioInstance || !courseId || !courseEvents?.length) return
  ioInstance.to(mentorshipCourseRoom(courseId)).emit('course_events_batch', courseEvents)
}
