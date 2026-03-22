import { useState, useEffect } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

export default function AIContentView({
  roadmapStepId,
  courseId,
  course,
  updateCourse,
  refreshCourse,
}) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [contentByStep, setContentByStep] = useState({})

  const stepKey = roadmapStepId ? String(roadmapStepId) : null

  useEffect(() => {
    if (stepKey && contentByStep[stepKey]) {
      setContent(contentByStep[stepKey])
    } else if (course?.aiContent && !roadmapStepId) {
      setContent(course.aiContent || '')
    } else {
      setContent(stepKey ? contentByStep[stepKey] || '' : course?.aiContent || '')
    }
  }, [stepKey, contentByStep, course?.aiContent, roadmapStepId])

  useEffect(() => {
    if (!roadmapStepId && course?.aiContent) setContent(course.aiContent || '')
  }, [course])

  const handleGenerate = async () => {
    if (roadmapStepId) {
      setLoading(true)
      try {
        const res = await api.post('/api/ai/generate-content', {
          roadmapStepId,
          courseId,
        })
        const newContent = res.data.content
        setContent(newContent)
        setContentByStep((prev) => ({ ...prev, [String(roadmapStepId)]: newContent }))
        showToast('Content generated successfully!', 'success')
      } catch (err) {
        console.error('Failed to generate content:', err)
        showToast(err.response?.data?.message || 'Failed to generate content', 'error')
      } finally {
        setLoading(false)
      }
      return
    }
    if (!courseId || !course) return
    setLoading(true)
    try {
      const res = await api.post('/api/ai/generate-content', {
        courseId,
        domain: course.domain,
        title: course.title,
      })
      const newContent = res.data.content
      setContent(newContent)
      await updateCourse?.({ aiContent: newContent })
      showToast('Content generated successfully!', 'success')
    } catch (err) {
      console.error('Failed to generate content:', err)
      showToast('Failed to generate content', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!updateCourse) return
    setSaving(true)
    try {
      await updateCourse({ aiContent: content })
      showToast('Content saved!', 'success')
    } catch {
      showToast('Failed to save content', 'error')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!content || content === course?.aiContent || roadmapStepId) return
    const timeoutId = setTimeout(() => {
      updateCourse?.({ aiContent: content })
    }, 2000)
    return () => clearTimeout(timeoutId)
  }, [content])

  return (
    <div className="bg-white rounded-2xl shadow p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold">AI Content</h3>
        <div className="space-x-2">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Generating...' : roadmapStepId ? 'Generate for step' : 'Regenerate'}
          </button>
          {!roadmapStepId && updateCourse && (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="AI-generated learning content will appear here. Generate content from a roadmap step or use Regenerate."
        className="flex-1 w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none min-h-[120px]"
      />
    </div>
  )
}
