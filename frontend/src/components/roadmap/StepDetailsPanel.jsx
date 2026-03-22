import { useState } from 'react'
import api from '../../utils/api'
import { showToast } from '../Toast'
import LevelBadge from './LevelBadge'
import ProgressBar from './ProgressBar'

export default function StepDetailsPanel({ step, courseId }) {
  const [generating, setGenerating] = useState(false)
  const [viewContent, setViewContent] = useState(false)
  const [viewTasks, setViewTasks] = useState(false)

  const handleGenerateContent = async () => {
    if (!step?.stepId && !step?._id) return
    const stepId = step.stepId || step._id
    setGenerating(true)
    try {
      await api.post('/api/ai/generate-content', {
        roadmapStepId: stepId,
        roadmapId: step.roadmapId,
        courseId,
      })
      showToast('Content generated successfully', 'success')
      setViewContent(true)
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate content'
      showToast(msg, 'error')
    } finally {
      setGenerating(false)
    }
  }

  if (!step) {
    return (
      <div className="bg-white rounded-2xl shadow p-6 flex items-center justify-center text-gray-500 min-h-[180px]">
        Select a roadmap step to see details and actions.
      </div>
    )
  }

  const stepId = step.stepId || step._id
  const canGenerate = !step.aiContentGenerated
  const subtopics = step.subtopics || []

  return (
    <div className="bg-white rounded-2xl shadow p-6 flex flex-col min-h-[180px]">
      <div className="flex items-center gap-2 mb-2">
        <LevelBadge level={step.level} />
        <span className="text-sm text-gray-500">Step {step.order}</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{step.title}</h3>
      {step.description && (
        <p className="text-sm text-gray-600 mb-3">{step.description}</p>
      )}
      {subtopics.length > 0 && (
        <ul className="text-sm text-gray-600 list-disc list-inside mb-4">
          {subtopics.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
      <div className="mt-auto flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleGenerateContent}
          disabled={generating || !canGenerate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
        >
          {generating ? 'Generating...' : canGenerate ? 'Generate Content' : 'Content generated'}
        </button>
        <button
          type="button"
          onClick={() => setViewContent((v) => !v)}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
        >
          {viewContent ? 'Hide Content' : 'View Content'}
        </button>
        <button
          type="button"
          onClick={() => setViewTasks((v) => !v)}
          className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
        >
          {viewTasks ? 'Hide Tasks' : 'View Tasks'}
        </button>
      </div>
      {step.progress != null && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Progress</p>
          <ProgressBar progress={step.progress} />
        </div>
      )}
    </div>
  )
}
