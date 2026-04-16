import { useState, useEffect } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

export default function AIContentView({
  mentorshipId,
  level,
  userRole = 'mentee',
  courseId,
  realtimeContentEvent = null,
  realtimeSnapshot = null,
}) {
  const [selectedLevel, setSelectedLevel] = useState((level || 'beginner').toLowerCase())
  const [contentMap, setContentMap] = useState({})
  const [initialContentMap, setInitialContentMap] = useState({})
  
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [showPromptModal, setShowPromptModal] = useState(false)
  const [promptInput, setPromptInput] = useState('')
  
  const isMentor = userRole === 'mentor'
  const levels = ['beginner', 'intermediate', 'advanced', 'master']

  const content = contentMap[selectedLevel] || ''
  const initialContent = initialContentMap[selectedLevel] || ''

  useEffect(() => {
    if (level) {
      setSelectedLevel(level.toLowerCase())
    }
  }, [level])

  const fetchContent = async () => {
    if (!courseId) return
    setLoading(true)
    try {
      const res = await api.get(`/api/ai/content/${courseId}`, {
        params: { level: selectedLevel },
      })
      const rawContent = res.data?.content || ''
      let next = rawContent

      if (rawContent) {
        let parsedContent = rawContent
        if (typeof parsedContent === 'string') {
          try {
            parsedContent = JSON.parse(parsedContent)
          } catch(e) { }
        }

        if (parsedContent?.explanation) {
          next = `# ${selectedLevel.charAt(0).toUpperCase() + selectedLevel.slice(1)} Level Content\n\n## Explanation\n${parsedContent.explanation}\n\n## Examples\n${(parsedContent.examples || []).map((item) => `- ${item}`).join('\n') || '- No examples provided.'}\n\n## Resources\n${(parsedContent.resources || []).map((item) => `- ${item}`).join('\n') || '- No resources provided.'}`
        }
      }

      setContentMap(prev => ({
        ...prev,
        [selectedLevel]: next || prev[selectedLevel] || ''
      }))
      setInitialContentMap(prev => ({
        ...prev,
        [selectedLevel]: next || prev[selectedLevel] || ''
      }))
    } catch (err) {
      console.error('Failed to load level content:', err)
      showToast(err.response?.data?.message || 'Failed to load AI content', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContent()
  }, [courseId, selectedLevel])

  useEffect(() => {
    if (!realtimeContentEvent) return
    if (String(realtimeContentEvent.courseId || '') !== String(courseId || '')) return
    
    let parsedContent = realtimeContentEvent.content
    if (typeof parsedContent === 'string') {
      try {
        parsedContent = JSON.parse(parsedContent)
      } catch(e) {}
    }

    const lvl = String(realtimeContentEvent.level || '').toLowerCase()
    let next = parsedContent?.explanation
      ? `# ${lvl.charAt(0).toUpperCase() + lvl.slice(1)} Level Content\n\n## Explanation\n${parsedContent.explanation}\n\n## Examples\n${(parsedContent.examples || []).map((item) => `- ${item}`).join('\n') || '- No examples provided.'}\n\n## Resources\n${(parsedContent.resources || []).map((item) => `- ${item}`).join('\n') || '- No resources provided.'}`
      : (typeof realtimeContentEvent.content === 'string' ? realtimeContentEvent.content : '')

    setContentMap(prev => ({ ...prev, [lvl]: next }))
    setInitialContentMap(prev => ({ ...prev, [lvl]: next }))
  }, [realtimeContentEvent, courseId])

  useEffect(() => {
    if (!realtimeSnapshot?.aiContents) return
    const found = realtimeSnapshot.aiContents.find((item) => String(item.level || '').toLowerCase() === selectedLevel)
    if (!found) return
    
    setContentMap(prev => ({ ...prev, [selectedLevel]: found.content || prev[selectedLevel] || '' }))
    setInitialContentMap(prev => ({ ...prev, [selectedLevel]: found.content || prev[selectedLevel] || '' }))
  }, [realtimeSnapshot, selectedLevel])

  const handleGenerate = async () => {
    if (!courseId || !isMentor) return
    setLoading(true)
    setShowPromptModal(false)
    try {
      const res = await api.post(`/api/ai/generate-level-content`, {
        courseId,
        level: selectedLevel,
        prompt: promptInput
      })
      const c = res.data?.content || {}
      const next = `# ${selectedLevel.charAt(0).toUpperCase() + selectedLevel.slice(1)} Level Content\n\n## Explanation\n${c.explanation}\n\n## Examples\n${(c.examples || []).map((item) => `- ${item}`).join('\n')}\n\n## Resources\n${(c.resources || []).map((item) => `- ${item}`).join('\n')}`
      
      setContentMap(prev => ({ ...prev, [selectedLevel]: next }))
      setInitialContentMap(prev => ({ ...prev, [selectedLevel]: next }))
      
      showToast('Content generated successfully!', 'success')
      setPromptInput('')
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
        level: selectedLevel,
        content,
      })
      setInitialContentMap(prev => ({ ...prev, [selectedLevel]: content }))
      showToast('Content saved!', 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save content', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setContentMap(prev => ({ ...prev, [selectedLevel]: initialContent }))
  }

  const handlePublish = async () => {
    if (!courseId || !isMentor) return
    setPublishing(true)
    try {
      await api.post(`/api/ai/publish-level-content`, {
        courseId,
        level: selectedLevel,
      })
      showToast('Content pushed to mentee', 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to push content', 'error')
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 text-gray-300 min-h-0 relative">
      {/* Modals for Prompt Input */}
      {showPromptModal && isMentor && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm rounded-xl">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h4 className="text-white text-lg font-semibold mb-4">Generate Content for {selectedLevel}</h4>
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="E.g., Explain the concept of hooks and provide a useEffect example..."
              className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-400 mb-4 h-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPromptModal(false)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading || !promptInput.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center mb-4 flex-shrink-0 gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">AI Content</h3>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-gray-400">Level:</span>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none cursor-pointer"
            >
              {levels.map(l => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-x-2">
          {isMentor && (
            <button
              onClick={() => setShowPromptModal(true)}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Generate Content
            </button>
          )}
          {isMentor && (
            <>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save Edits'}
              </button>
              <button
                onClick={handleReset}
                disabled={saving || loading || publishing}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || saving || loading || !initialContent}
                className="px-4 py-2 border border-indigo-500 text-indigo-400 rounded-lg hover:bg-indigo-600 hover:text-white disabled:opacity-50 transition-colors"
              >
                {publishing ? 'Pushing...' : 'Push to Mentee'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 bg-slate-900 border border-slate-700 rounded-lg p-1">
        <textarea
          value={content}
          onChange={(e) => setContentMap(prev => ({ ...prev, [selectedLevel]: e.target.value }))}
          readOnly={!isMentor}
          placeholder={
            loading
              ? 'Loading content...'
              : 'No AI content generated for this level yet.'
          }
          className={`w-full h-full p-4 bg-transparent text-white placeholder:text-gray-500 focus:outline-none resize-none ${!isMentor ? 'cursor-default' : 'focus:ring-2 focus:ring-indigo-500'}`}
        />
      </div>
    </div>
  )
}
