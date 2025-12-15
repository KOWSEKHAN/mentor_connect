import { useState, useEffect } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

export default function AIContentView({ course, updateCourse, courseId, refreshCourse }) {
  const [content, setContent] = useState(course.aiContent || '')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setContent(course.aiContent || '')
  }, [course])

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await api.post('/api/ai/generate-content', {
        courseId,
        domain: course.domain,
        title: course.title
      })
      const newContent = res.data.content
      setContent(newContent)
      await updateCourse({ aiContent: newContent })
      showToast('Content generated successfully!', 'success')
    } catch (err) {
      console.error('Failed to generate content:', err)
      showToast('Failed to generate content', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateCourse({ aiContent: content })
      showToast('Content saved!', 'success')
    } catch (err) {
      showToast('Failed to save content', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Auto-save on content change (debounced)
  useEffect(() => {
    if (!content || content === course.aiContent) return

    const timeoutId = setTimeout(() => {
      updateCourse({ aiContent: content })
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
            {loading ? 'Generating...' : 'Regenerate'}
          </button>
          {saving && <span className="text-sm text-gray-500">Saving...</span>}
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="AI-generated learning content will appear here. Click 'Regenerate' to create new content."
        className="flex-1 w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  )
}

