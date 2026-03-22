import TasksView from './TasksView'

/**
 * Tasks panel driven by selected roadmap step.
 * Passes through to TasksView (course-level tasks) for now.
 * roadmapStepId reserved for future step-scoped tasks.
 */
export default function TasksPanel({ roadmapStepId, course, updateCourse, refreshCourse }) {
  return (
    <div className="h-full overflow-auto">
      <TasksView
        course={course}
        updateCourse={updateCourse}
        refreshCourse={refreshCourse}
      />
    </div>
  )
}
