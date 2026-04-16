import { useState } from 'react'
import api from '../../utils/api'
import { showToast } from '../Toast'

export default function RoadmapGenerateModal({ courseId, menteeId, isOpen, onClose, onGenerated }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    if (!courseId || !menteeId) return
    setLoading(true)
    try {
      const res = await api.post('/api/roadmap/generate-ai', {
        courseId,
        menteeId,
        domain: prompt.trim() || undefined,
      })
      showToast('Roadmap generated successfully', 'success')
      setPrompt('')
      onClose?.()
      onGenerated?.(res.data)
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate roadmap'
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setPrompt('')
      onClose?.()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={handleClose}>
      <div
        className="bg-gray-800 border border-gray-700 rounded-2xl shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white mb-2">Generate AI Roadmap</h3>
        <p className="text-sm text-gray-300 mb-4">
          Optionally describe the domain or focus. Leave blank to use course defaults.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Web development, Data structures..."
          className="w-full p-3 border border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
          disabled={loading}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-700 rounded-lg hover:bg-gray-700/50 disabled:opacity-50 text-gray-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
