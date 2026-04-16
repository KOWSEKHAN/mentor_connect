import { useState, useEffect, useMemo, memo } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

function TasksView({
  mentorshipId,
  level,
  userRole = 'mentee',
  courseId,
  realtimeTaskCreatedEvent = null,
  realtimeTaskCompletedEvent = null,
  realtimeSnapshot = null,
}) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const activeLevel = useMemo(() => (level || 'beginner').toLowerCase(), [level])
  const isMentor = userRole === 'mentor'

  const fetchTasks = async () => {
    if (!mentorshipId) return
    setLoading(true)
    try {
      const res = await api.get(`/api/structured/${mentorshipId}/tasks`, {
        params: { level: activeLevel },
      })
      setTasks(res.data?.tasks || [])
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setTasks([])
      showToast(err.response?.data?.message || 'Failed to load tasks', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTasks()
  }, [mentorshipId, activeLevel])

  const toggleTask = async (index) => {
    if (isMentor) return
    const task = tasks[index]
    if (!task?._id) return
    try {
      await api.patch(`/api/structured/tasks/${task._id}/toggle`)
      showToast('Task updated!', 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update task', 'error')
    }
  }

  const addTask = async () => {
    if (!isMentor || !mentorshipId) return
    const taskText = prompt('Enter task name:')
    if (!taskText) return
    const description = prompt('Enter task description (optional):') || ''
    const tempId = `temp-${Date.now()}`
    const optimisticTask = {
      _id: tempId,
      title: taskText,
      description,
      isCompleted: false,
      completedBy: null,
      level: activeLevel,
      order: (tasks[tasks.length - 1]?.order || tasks.length) + 1,
      optimistic: true,
    }
    setTasks((prev) => [...prev, optimisticTask])

    setCreating(true)
    try {
      const res = await api.post(`/api/structured/${mentorshipId}/tasks`, {
        level: activeLevel,
        title: taskText,
        description,
        courseId,
      })
      const createdTask = res.data?.task
      if (createdTask?._id) {
        setTasks((prev) => prev.map((task) => (
          task._id === tempId ? createdTask : task
        )))
      }
      showToast('Task added!', 'success')
    } catch (err) {
      setTasks((prev) => prev.filter((task) => task._id !== tempId))
      showToast(err.response?.data?.message || 'Failed to add task', 'error')
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    if (!realtimeTaskCreatedEvent) return
    if (String(realtimeTaskCreatedEvent.courseId || '') !== String(courseId || '')) return
    if (String(realtimeTaskCreatedEvent.level || '').toLowerCase() !== activeLevel) return
    const incoming = realtimeTaskCreatedEvent.task
    if (!incoming?._id) return
    setTasks((prev) => {
      if (prev.some((task) => String(task._id) === String(incoming._id))) return prev
      return [...prev, incoming].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    })
  }, [realtimeTaskCreatedEvent, courseId, activeLevel])

  useEffect(() => {
    if (!realtimeTaskCompletedEvent) return
    if (String(realtimeTaskCompletedEvent.courseId || '') !== String(courseId || '')) return
    const incoming = realtimeTaskCompletedEvent.task
    if (!incoming?._id) return
    setTasks((prev) => prev.map((task) => (
      String(task._id) === String(incoming._id) ? { ...task, ...incoming } : task
    )))
  }, [realtimeTaskCompletedEvent, courseId])

  useEffect(() => {
    if (!realtimeSnapshot?.tasks) return
    const byLevel = realtimeSnapshot.tasks.filter((task) => String(task.level || '').toLowerCase() === activeLevel)
    setTasks(byLevel)
  }, [realtimeSnapshot, activeLevel])

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 h-full overflow-auto text-gray-300">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-xl font-semibold text-white">Tasks</h3>
          <p className="text-xs text-gray-400 mt-1">
            Level: <span className="capitalize text-indigo-300">{activeLevel}</span>
          </p>
        </div>
        {isMentor && (
          <button
            onClick={addTask}
            disabled={creating}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? 'Adding...' : '+ Add Task'}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-gray-400 text-center py-8">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-gray-400 text-center py-8">
            {isMentor ? 'No tasks yet. Add one to get started!' : 'No tasks assigned for this level yet.'}
          </p>
        ) : (
          tasks.map((task, index) => (
            <div
              key={task._id || index}
              className="flex items-center p-4 border border-gray-700 rounded-lg hover:bg-gray-700/50"
            >
              <input
                type="checkbox"
                checked={task.isCompleted || false}
                onChange={() => toggleTask(index)}
                disabled={isMentor}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              />
              <div className="ml-3 flex-1">
                <span
                  className={`block ${
                    task.isCompleted ? 'line-through text-gray-400' : 'text-gray-200'
                  }`}
                >
                  {task.title}
                </span>
                {task.description ? (
                  <span className="block text-xs text-gray-400 mt-1">{task.description}</span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default memo(TasksView)
