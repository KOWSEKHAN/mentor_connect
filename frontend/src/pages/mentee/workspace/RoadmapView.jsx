import { useState, useEffect } from 'react'
import { showToast } from '../../../components/Toast'

export default function RoadmapView({ course, updateCourse, refreshCourse }) {
  const [roadmap, setRoadmap] = useState(course.roadmap || [])

  useEffect(() => {
    setRoadmap(course.roadmap || [])
  }, [course])

  const toggleStep = async (index) => {
    const updated = [...roadmap]
    updated[index].completed = !updated[index].completed
    
    setRoadmap(updated)
    
    const success = await updateCourse({ roadmap: updated })
    if (success) {
      showToast('Roadmap updated!', 'success')
    }
  }

  const addStep = async () => {
    const stepText = prompt('Enter step name:')
    if (!stepText) return

    const newStep = { step: stepText, completed: false }
    const updated = [...roadmap, newStep]
    setRoadmap(updated)

    const success = await updateCourse({ roadmap: updated })
    if (success) {
      showToast('Step added!', 'success')
    }
  }

  // Initialize with default steps if empty
  useEffect(() => {
    if (roadmap.length === 0 && course.domain) {
      const defaultSteps = [
        { step: `Introduction to ${course.domain}`, completed: false },
        { step: 'Fundamentals and Basics', completed: false },
        { step: 'Core Concepts', completed: false },
        { step: 'Practical Applications', completed: false },
        { step: 'Advanced Topics', completed: false },
        { step: 'Final Project', completed: false }
      ]
      setRoadmap(defaultSteps)
      updateCourse({ roadmap: defaultSteps })
    }
  }, [])

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 h-full overflow-auto text-gray-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">Learning Roadmap</h3>
        <button
          onClick={addStep}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + Add Step
        </button>
      </div>

      <div className="space-y-3">
        {roadmap.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No roadmap steps yet. Add one to get started!</p>
        ) : (
          roadmap.map((step, index) => (
            <div
              key={index}
              className="flex items-center p-4 border border-gray-700 rounded-lg hover:bg-gray-700/50"
            >
              <input
                type="checkbox"
                checked={step.completed || false}
                onChange={() => toggleStep(index)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
              />
              <span
                className={`ml-3 flex-1 ${
                  step.completed ? 'line-through text-gray-400' : 'text-gray-200'
                }`}
              >
                {step.step}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

