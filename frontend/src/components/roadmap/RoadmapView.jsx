import { useState, useEffect, useCallback } from 'react'
import api from '../../utils/api'
import StepCard from './StepCard'
import RoadmapGenerateModal from './RoadmapGenerateModal'
import { showToast } from '../Toast'

export default function RoadmapView({ courseId, userRole, onStepSelect, course = null }) {
  const [roadmap, setRoadmap] = useState(null)
  const [steps, setSteps] = useState([])
  const [currentLevel, setCurrentLevel] = useState('beginner')
  const [levels, setLevels] = useState(['beginner', 'intermediate', 'advanced', 'master'])
  const [progress, setProgress] = useState(0)
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
        const nextCurrentLevel = data.currentLevel || course?.currentLevel || 'beginner'
        const nextLevels = Array.isArray(data.levels) && data.levels.length
          ? data.levels
          : (course?.levels || ['beginner', 'intermediate', 'advanced', 'master'])
        setRoadmap({
          roadmapId: data.roadmapId,
          title: data.title,
          version: data.version,
          generatedBy: data.generatedBy,
        })
        setSteps(data.steps || [])
        setCurrentLevel(nextCurrentLevel)
        setLevels(nextLevels)
        setProgress(Number(data.progress ?? course?.progress ?? 0))
        setTitle(data.title || '')
        if (data.steps?.length) {
          const preferred = data.steps.find((s) => s.level === nextCurrentLevel) || data.steps[0]
          setSelectedStep(preferred)
          onStepSelect?.(preferred)
        }
      } else {
        setRoadmap(null)
        setSteps([])
        setCurrentLevel(course?.currentLevel || 'beginner')
        setLevels(course?.levels || ['beginner', 'intermediate', 'advanced', 'master'])
        setProgress(Number(course?.progress ?? 0))
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
      setCurrentLevel(course?.currentLevel || 'beginner')
      setLevels(course?.levels || ['beginner', 'intermediate', 'advanced', 'master'])
      setProgress(Number(course?.progress ?? 0))
      setSelectedStep(null)
      onStepSelect?.(null)
    } finally {
      setLoading(false)
    }
  }, [courseId, onStepSelect, course?.currentLevel, course?.levels, course?.progress])

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
  const currentLevelIdx = Math.max(0, levels.indexOf(currentLevel))
  const safeSteps = Array.isArray(steps) ? steps : []

  if (loading) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 flex items-center justify-center min-h-[140px]">
        <span className="text-gray-300">Generating roadmap...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6">
        <p className="text-red-400 mb-2">Unable to generate roadmap. Please try again.</p>
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
      <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-4">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Course title"
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className="px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-700/50 disabled:opacity-50"
            >
              {regenerating ? 'Regenerating...' : 'Regenerate'}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Current Level</span>
          <span className="px-2.5 py-1 rounded-full bg-indigo-600/20 text-indigo-200 text-xs font-medium">
            {(currentLevel || 'beginner').toUpperCase()}
          </span>
          <span className="text-xs text-gray-400 uppercase tracking-wide">Progress</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-600/20 text-emerald-200 text-xs font-medium">
            {Math.max(0, Math.min(100, Number(progress || 0)))}%
          </span>
        </div>

        {!roadmap ? (
          <p className="text-gray-400 py-6 text-center">
            No roadmap yet. Click Generate to create one, or ask your mentor to create it.
          </p>
        ) : safeSteps.length === 0 ? (
          <p className="text-gray-400 py-6 text-center">No roadmap available</p>
        ) : (
          <div className="flex overflow-x-auto gap-4 snap-x snap-mandatory pb-4">
            {safeSteps.map((step) => {
              const stepLevelIdx = Math.max(0, levels.indexOf(step?.level || 'beginner'))
              const isLocked = userRole === 'mentee' && stepLevelIdx > currentLevelIdx
              return (
              <StepCard
                key={step?.stepId || step?._id || String(step?.order)}
                step={step}
                isSelected={
                  (selectedStep?.stepId || selectedStep?._id) === (step?.stepId || step?._id)
                }
                isLocked={isLocked}
                onClick={handleStepSelect}
              />
              )
            })}
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
