import { useState, useEffect, useMemo } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

export default function AIContentView({
  mentorshipId,
  level,
  userRole = 'mentee',
}) {
  const [content, setContent] = useState('')
  const [initialContent, setInitialContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const activeLevel = useMemo(() => (level || 'beginner').toLowerCase(), [level])
  const isMentor = userRole === 'mentor'

  const fetchContent = async () => {
    if (!mentorshipId) return
    setLoading(true)
    try {
      const res = await api.get(`/api/structured/${mentorshipId}/content`, {
        params: { level: activeLevel },
      })
      const next = res.data?.content || ''
      setContent(next)
      setInitialContent(next)
    } catch (err) {
      console.error('Failed to load level content:', err)
      setContent('')
      setInitialContent('')
      showToast(err.response?.data?.message || 'Failed to load AI content', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContent()
  }, [mentorshipId, activeLevel])

  const handleGenerate = async () => {
    if (!mentorshipId || !isMentor) return
    setLoading(true)
    try {
      const res = await api.post(`/api/structured/${mentorshipId}/content`, {
        level: activeLevel,
      })
      const next = res.data?.content || ''
      setContent(next)
      setInitialContent(next)
      showToast('Content generated successfully!', 'success')
    } catch (err) {
      console.error('Failed to generate content:', err)
      showToast(err.response?.data?.message || 'Failed to generate content', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!mentorshipId || !isMentor) return
    setSaving(true)
    try {
      await api.post(`/api/structured/${mentorshipId}/content`, {
        level: activeLevel,
        content,
      })
      setInitialContent(content)
      showToast('Content saved!', 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save content', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setContent(initialContent)
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 text-gray-300 min-h-0">
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <div>
          <h3 className="text-xl font-semibold text-white">AI Content</h3>
          <p className="text-xs text-gray-400 mt-1">
            Level: <span className="capitalize text-indigo-300">{activeLevel}</span>
          </p>
        </div>
        <div className="space-x-2">
          {isMentor && (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Generating...' : 'Generate'}
            </button>
          )}
          {isMentor && (
            <>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-700/50 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleReset}
                disabled={saving || loading}
                className="px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-700/50 disabled:opacity-50"
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          readOnly={!isMentor}
          placeholder={
            loading
              ? 'Loading content...'
              : 'No AI content generated for this level yet.'
          }
          className="w-full h-full p-4 border border-gray-700 bg-gray-900 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  )
}
