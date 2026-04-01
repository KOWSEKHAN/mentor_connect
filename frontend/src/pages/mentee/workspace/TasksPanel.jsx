import TasksView from './TasksView'

/**
 * Tasks panel driven by selected roadmap step.
 * Passes through to TasksView (course-level tasks) for now.
 * roadmapStepId reserved for future step-scoped tasks.
 */
export default function TasksPanel({ roadmapStepId, course, userRole = 'mentee' }) {
  const mentorshipId = course?.mentorshipId
  const level = roadmapStepId?.level || roadmapStepId || course?.currentLevel || 'beginner'
  return (
    <div className="h-full overflow-auto">
      <TasksView
        mentorshipId={mentorshipId}
        level={level}
        userRole={userRole}
        courseId={course?._id}
      />
    </div>
  )
}
