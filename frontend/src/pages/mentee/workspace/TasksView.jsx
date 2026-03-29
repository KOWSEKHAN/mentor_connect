import { useState, useEffect } from 'react'
import { showToast } from '../../../components/Toast'

export default function TasksView({ course, updateCourse, refreshCourse }) {
  const [tasks, setTasks] = useState(course.tasks || [])

  useEffect(() => {
    setTasks(course.tasks || [])
  }, [course])

  const toggleTask = async (index) => {
    const updated = [...tasks]
    updated[index].completed = !updated[index].completed
    
    setTasks(updated)
    
    const success = await updateCourse({ tasks: updated })
    if (success) {
      showToast('Task updated!', 'success')
    }
  }

  const addTask = async () => {
    const taskText = prompt('Enter task name:')
    if (!taskText) return

    const newTask = { title: taskText, completed: false }
    const updated = [...tasks, newTask]
    setTasks(updated)

    const success = await updateCourse({ tasks: updated })
    if (success) {
      showToast('Task added!', 'success')
    }
  }

  const deleteTask = async (index) => {
    if (!confirm('Delete this task?')) return

    const updated = tasks.filter((_, i) => i !== index)
    setTasks(updated)

    const success = await updateCourse({ tasks: updated })
    if (success) {
      showToast('Task deleted!', 'success')
    }
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 h-full overflow-auto text-gray-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">Tasks</h3>
        <button
          onClick={addTask}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Add Task
        </button>
      </div>

      <div className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No tasks yet. Add one to get started!</p>
        ) : (
          tasks.map((task, index) => (
            <div
              key={index}
              className="flex items-center p-4 border border-gray-700 rounded-lg hover:bg-gray-700/50"
            >
              <input
                type="checkbox"
                checked={task.completed || false}
                onChange={() => toggleTask(index)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              />
              <span
                className={`ml-3 flex-1 ${
                  task.completed ? 'line-through text-gray-400' : 'text-gray-200'
                }`}
              >
                {task.title}
              </span>
              <button
                onClick={() => deleteTask(index)}
                className="ml-2 text-red-400 hover:text-red-300"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

