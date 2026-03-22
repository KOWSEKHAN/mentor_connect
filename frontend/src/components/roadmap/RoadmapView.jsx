import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import StepCard from './StepCard'
import RoadmapGenerateModal from './RoadmapGenerateModal'
import { showToast } from '../Toast'

export default function RoadmapView({ courseId, userRole, onStepSelect, course = null }) {
  const [roadmap, setRoadmap] = useState(null)
  const [steps, setSteps] = useState([])
  const [selectedStep, setSelectedStep] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const menteeId = course?.mentee?._id || course?.mentee || roadmap?.menteeId

  const fetchRoadmap = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/roadmaps/${courseId}`)
      const data = res.data
      if (data.roadmapId) {
        setRoadmap({
          roadmapId: data.roadmapId,
          title: data.title,
          version: data.version,
          generatedBy: data.generatedBy,
        })
        setSteps(data.steps || [])
        setTitle(data.title || '')
        if (!selectedStep && data.steps?.length) {
          setSelectedStep(data.steps[0])
          onStepSelect?.(data.steps[0])
        }
      } else {
        setRoadmap(null)
        setSteps([])
        setTitle('')
        setSelectedStep(null)
        onStepSelect?.(null)
      }
    } catch (err) {
      console.error('Failed to fetch roadmap:', err)
      const msg = err.response?.data?.message || 'Failed to load roadmap'
      setError(msg)
      setRoadmap(null)
      setSteps([])
      setSelectedStep(null)
      onStepSelect?.(null)
    } finally {
      setLoading(false)
    }
  }, [courseId, onStepSelect])

  useEffect(() => {
    fetchRoadmap()
  }, [fetchRoadmap])

  useEffect(() => {
    if (roadmap?.title) setTitle(roadmap.title)
  }, [roadmap?.title])

  const handleStepSelect = (step) => {
    setSelectedStep(step)
    onStepSelect?.(step)
  }

  const handleRegenerate = async () => {
    if (!courseId) return
    setRegenerating(true)
    try {
      await api.post(`/api/roadmaps/regenerate/${courseId}`)
      showToast('Roadmap regenerated', 'success')
      fetchRoadmap()
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to regenerate roadmap'
      showToast(msg, 'error')
    } finally {
      setRegenerating(false)
    }
  }

  const showRegenerate = userRole === 'mentor'
  const canGenerate = !roadmap || roadmap.generatedBy !== 'mentor'

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow p-6 flex items-center justify-center min-h-[140px]">
        <span className="text-gray-500">Loading roadmap...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow p-6">
        <p className="text-red-600 mb-2">{error}</p>
        <button
          type="button"
          onClick={() => fetchRoadmap()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Course title"
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {canGenerate && (
            <button
              type="button"
              onClick={() => setGenerateModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Generate
            </button>
          )}
          {showRegenerate && roadmap && (
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {regenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
          )}
        </div>

        {!roadmap ? (
          <p className="text-gray-500 py-6 text-center">
            No roadmap yet. Click Generate to create one, or ask your mentor to create it.
          </p>
        ) : (
          <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory pb-4">
            {steps.map((step) => (
              <StepCard
                key={step.stepId || step._id}
                step={step}
                isSelected={
                  (selectedStep?.stepId || selectedStep?._id) === (step.stepId || step._id)
                }
                isLocked={false}
                onClick={handleStepSelect}
              />
            ))}
          </div>
        )}
      </div>

      <RoadmapGenerateModal
        courseId={courseId}
        menteeId={menteeId}
        isOpen={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        onGenerated={() => {
          setGenerateModalOpen(false)
          fetchRoadmap()
        }}
      />
    </>
  )
}
