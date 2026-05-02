import React, { useState, useEffect, useCallback, useRef } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

const LEVELS = ['beginner', 'intermediate', 'advanced', 'master']

const STATUS_BADGE = {
  published: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  draft:     'bg-amber-500/20  text-amber-300  border border-amber-500/30',
}

const GEN_STATUS = {
  generating: { label: 'Generating…', cls: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse' },
  failed:     { label: 'Generation failed', cls: 'bg-rose-500/20 text-rose-300 border border-rose-500/30' },
  idle:       null,
}

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent']
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("AI Content Render Error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-6 text-rose-400 bg-slate-900 border border-slate-700 rounded-xl flex-col gap-3 shadow-lg">
          <span className="text-4xl text-rose-500 animate-pulse">⚠</span>
          <h2 className="text-lg font-semibold text-white">Content Runtime Error</h2>
          <p className="text-sm text-slate-400 text-center max-w-xs">The UI encountered bad data from the AI pipeline.</p>
          <button onClick={() => this.setState({ hasError: false })} className="px-4 py-2 mt-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm border border-slate-600 transition-colors">Emergency Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AIContentView(props) {
  return (
    <ErrorBoundary>
      <AIContentViewInner {...props} />
    </ErrorBoundary>
  );
}

function AIContentViewInner({
  courseId,
  level,
  userRole = 'mentee',
  realtimeContentEvent = null,
  realtimeSnapshot     = null,
}) {
  const isMentor = userRole === 'mentor'

  const [selectedLevel, setSelectedLevel] = useState((level || 'beginner').toLowerCase())
  const [docMap,        setDocMap]        = useState({})
  const [editMap,       setEditMap]       = useState({})
  const [historyMap,    setHistoryMap]    = useState({})

  const [loading,    setLoading]    = useState(false)
  const [generating, setGenerating] = useState(false)
  const [streaming,  setStreaming]  = useState(false)
  const [streamText, setStreamText] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [rating,     setRating]     = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showHistory,setShowHistory]= useState(false)
  const [prompt,     setPrompt]     = useState('')
  const [noRoadmap,  setNoRoadmap]  = useState(false)
  const [pollTimer,  setPollTimer]  = useState(null)

  useEffect(() => { if (level) setSelectedLevel(level.toLowerCase()) }, [level])

  /* ── Fetch content ─────────────────────────────────────────────────── */
  const fetchContent = useCallback(async () => {
    if (!courseId) return
    setLoading(true)
    const normalizedLevel = selectedLevel.toLowerCase()
    try {
      const res = await api.get(`/api/ai/content/${courseId}`, { params: { level: normalizedLevel } })
      const safeData = res.data || {}
      const safeContent = safeData.content || {}
      
      setDocMap(prev => ({ ...prev, [normalizedLevel]: { 
        content: safeContent, 
        version: safeData.version, 
        status: safeData.status, 
        isActive: safeData.isActive, 
        generationStatus: safeData.generationStatus, 
        qualityScore: safeData.qualityScore, 
        updatedAt: safeData.updatedAt 
      } }))
      setEditMap(prev => ({
        ...prev,
        [normalizedLevel]: { ...safeContent }
      }))
      if (safeData.generationStatus === 'generating') startPolling()
    } catch (err) {
      console.error("Fetch failed:", err);
      setDocMap(prev => ({ ...prev, [normalizedLevel]: { content: {} } }))
      setEditMap(prev => ({ ...prev, [normalizedLevel]: { explanation: '', examples: [], resources: [] } }))
      if (err.response?.status !== 404) {
         showToast(err.response?.data?.message || 'Failed to load content', 'error')
      }
    } finally {
      setLoading(false)
    }
  }, [courseId, selectedLevel])

  useEffect(() => {
    fetchContent()
    return () => stopPolling()
  }, [fetchContent])

  /* ── Polling for generating status ─────────────────────────────────── */
  const stopPolling = useCallback(() => {
    setPollTimer(t => { if (t) clearInterval(t); return null })
  }, [])

  const startPolling = useCallback(() => {
    stopPolling()
    const t = setInterval(async () => {
      try {
        const res = await api.get(`/api/ai/content/${courseId}`, { params: { level: selectedLevel } })
        const d = res.data
        setDocMap(prev => ({ ...prev, [selectedLevel]: d }))
        if (d.generationStatus !== 'generating') {
          setEditMap(prev => d.content ? { ...prev, [selectedLevel]: { ...d.content } } : prev)
          clearInterval(t); setPollTimer(null)
        }
      } catch { /* ignore */ }
    }, 3000)
    setPollTimer(t)
  }, [courseId, selectedLevel, stopPolling])

  /* ── Realtime updates ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!realtimeContentEvent) return
    if (String(realtimeContentEvent.courseId || '') !== String(courseId || '')) return
    const lvl = String(realtimeContentEvent.level || '').toLowerCase()
    const c   = realtimeContentEvent.content || null
    if (!c || isMentor) return
    setDocMap(prev => ({ ...prev, [lvl]: { ...prev[lvl], content: c } }))
    setEditMap(prev => ({ ...prev, [lvl]: { ...c } }))
  }, [realtimeContentEvent, courseId, isMentor])

  useEffect(() => {
    if (!realtimeSnapshot?.aiContents) return
    for (const item of realtimeSnapshot.aiContents) {
      const lvl = String(item.level || '').toLowerCase()
      if (item.content && !isMentor) {
        setDocMap(prev => ({ ...prev, [lvl]: { ...prev[lvl], content: item.content } }))
        setEditMap(prev => ({ ...prev, [lvl]: { ...item.content } }))
      }
    }
  }, [realtimeSnapshot, isMentor])

  /* ── Fetch history (mentor only) ───────────────────────────────────── */
  const fetchHistory = useCallback(async () => {
    if (!courseId || !isMentor) return
    try {
      const res = await api.get(`/api/ai/content/${courseId}/history`, { params: { level: selectedLevel } })
      setHistoryMap(prev => ({ ...prev, [selectedLevel]: res.data.versions || [] }))
    } catch { /* non-critical */ }
  }, [courseId, selectedLevel, isMentor])

  useEffect(() => { if (showHistory) fetchHistory() }, [showHistory, fetchHistory])

  /* ── Auth token helper (for fetch-based streaming) ─────────────────── */
  const getToken = () =>
    localStorage.getItem('token')   ||
    sessionStorage.getItem('token') ||
    api.defaults?.headers?.common?.Authorization?.replace('Bearer ', '') ||
    ''

  /* ── Mentor actions ──────────────────────────────────────────────── */

  /** Sync generation (fallback / non-streaming) */
  const handleGenerate = async () => {
    if (!courseId || !isMentor) return
    setGenerating(true)
    setShowPrompt(false)
    setNoRoadmap(false)
    try {
      const res = await api.post('/api/ai/generate-level-content', {
        courseId, level: selectedLevel, prompt,
      })
      const { content, version, status, usedFallback, attempts } = res.data
      setDocMap(prev => ({ ...prev, [selectedLevel]: { ...prev[selectedLevel], content, version, status, generationStatus: 'idle' } }))
      setEditMap(prev => ({ ...prev, [selectedLevel]: content ? { ...content } : prev[selectedLevel] }))
      setHistoryMap(prev => ({ ...prev, [selectedLevel]: [] }))
      setPrompt('')
      showToast(usedFallback ? `Draft v${version} (fallback, ${attempts} attempts)` : `Draft v${version} created`, usedFallback ? 'warning' : 'success')
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate'
      if (msg.toLowerCase().includes('roadmap') || msg.toLowerCase().includes('progress')) setNoRoadmap(true)
      showToast(msg, 'error')
    } finally {
      setGenerating(false)
    }
  }

  /* Streaming logic setup */
  const abortControllerRef = useRef(null);

  const handleCancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setStreaming(false);
      setGenerating(false);
      showToast('Generation cancelled.', 'warning');
    }
  }

  /** Streaming generation — shows live tokens via SSE, saves on complete */
  const handleStreamGenerate = async () => {
    if (!courseId || !isMentor) return
    setStreaming(true)
    setStreamText('')
    setShowPrompt(false)
    setNoRoadmap(false)
    abortControllerRef.current = new AbortController()

    try {
      const res = await fetch('/api/ai/stream-level-content', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body:    JSON.stringify({ courseId, level: selectedLevel, prompt }),
        signal:  abortControllerRef.current.signal
      })

      if (!res.ok || !res.body) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.message || `HTTP ${res.status}`)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let streamBuffer = ''
      let tokenBuffer = ''
      let lastUpdateTime = Date.now()

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          if (tokenBuffer) setStreamText(t => t + tokenBuffer)
          break
        }

        streamBuffer += decoder.decode(value, { stream: true })
        const lines = streamBuffer.split('\n')
        streamBuffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'token') {
              tokenBuffer += evt.text
              if (Date.now() - lastUpdateTime > 50) {
                setStreamText(t => t + tokenBuffer)
                tokenBuffer = ''
                lastUpdateTime = Date.now()
              }
            } else if (evt.type === 'complete') {
              if (tokenBuffer) setStreamText(t => t + tokenBuffer)
              const safeData = evt || {}
              const safeContent = safeData.content || {}
              
              setDocMap(prev => ({ ...prev, [selectedLevel]: { ...prev[selectedLevel], content: safeContent, version: safeData.version, status: safeData.status, generationStatus: 'idle' } }))
              setEditMap(prev => ({ ...prev, [selectedLevel]: { ...safeContent } }))
              setHistoryMap(prev => ({ ...prev, [selectedLevel]: [] }))
              setStreamText('')
              setPrompt('')
              showToast(idempotent ? 'Cached result returned (idempotent)' : `Draft v${version} streamed ✦`, 'success')
            } else if (evt.type === 'error') {
              if (evt.code === 'NO_ROADMAP') setNoRoadmap(true)
              showToast(evt.message || 'Streaming error', 'error')
              setStreamText('')
            }
          } catch { /* skip malformed line */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      showToast(err.message || 'Streaming failed', 'error')
      setStreamText('')
    } finally {
      setStreaming(false)
      abortControllerRef.current = null
    }
  }

  const handleSave = async () => {
    if (!courseId || !isMentor) return
    const edited = editMap[selectedLevel]
    if (!edited?.explanation?.trim()) return showToast('Explanation cannot be empty', 'error')
    setSaving(true)
    try {
      const res = await api.post(`/api/ai/content/${courseId}`, { level: selectedLevel, content: edited })
      const { content, version, status } = res.data
      setDocMap(prev => ({ ...prev, [selectedLevel]: { ...prev[selectedLevel], content, version, status } }))
      showToast('Draft saved', 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!courseId || !isMentor) return
    setPublishing(true)
    try {
      const res = await api.put(`/api/ai/content/${courseId}/publish`, { level: selectedLevel })
      setDocMap(prev => ({ ...prev, [selectedLevel]: { ...prev[selectedLevel], status: 'published' } }))
      setHistoryMap(prev => ({ ...prev, [selectedLevel]: [] }))
      showToast(`v${res.data.version} published to mentee!`, 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to publish', 'error')
    } finally {
      setPublishing(false)
    }
  }

  const handleRate = async (score) => {
    if (!courseId || !isMentor || rating) return
    setRating(true)
    try {
      await api.patch(`/api/ai/content/${courseId}/rate`, { level: selectedLevel, score })
      setDocMap(prev => ({ ...prev, [selectedLevel]: { ...prev[selectedLevel], qualityScore: score } }))
      showToast(`Rated ${score}/5 ★`, 'success')
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to rate', 'error')
    } finally {
      setRating(false)
    }
  }

  /* ── Derived ─────────────────────────────────────────────────────── */
  const normalizedLevel = selectedLevel.toLowerCase()
  const docMeta         = docMap[normalizedLevel] || {}
  
  const rawContent      = docMeta.content
  const safeContent     = rawContent && typeof rawContent === 'object' ? rawContent : {}
  const current = {
    explanation: safeContent.explanation || '',
    examples: Array.isArray(safeContent.examples) ? safeContent.examples : [],
    resources: Array.isArray(safeContent.resources) ? safeContent.resources : []
  }

  const rawEditContent  = editMap[normalizedLevel]
  const safeEditContent = rawEditContent && typeof rawEditContent === 'object' ? rawEditContent : {}
  const currentEdit = {
    explanation: safeEditContent.explanation || '',
    examples: Array.isArray(safeEditContent.examples) ? safeEditContent.examples : [],
    resources: Array.isArray(safeEditContent.resources) ? safeEditContent.resources : []
  }

  const hasContent   = Boolean(current.explanation || current.examples.length > 0)
  const version      = docMeta.version          ?? null
  const status       = docMeta.status           ?? null
  const genStatus    = docMeta.generationStatus ?? null
  const qualityScore = docMeta.qualityScore     ?? null
  const history      = historyMap[normalizedLevel] || []
  
  const isGenerating = genStatus === 'generating' || generating
  const hasFailed    = genStatus === 'failed'
  const isBusy       = isGenerating || streaming || loading

  return (
    <div className="h-full flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-lg p-6 text-slate-300 min-h-0 relative overflow-hidden">

      {/* ── Prompt modal ─────────────────────────────────────────── */}
      {showPrompt && isMentor && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm rounded-xl">
          <div className="bg-slate-900 border border-slate-600 p-6 rounded-xl shadow-2xl w-full max-w-md">
            <h4 className="text-white text-lg font-semibold mb-1 capitalize">{selectedLevel} — Generate Content</h4>
            <p className="text-slate-400 text-xs mb-4">Creates a <strong>new draft version</strong>. AI uses previous level context automatically.</p>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Optional: e.g. Focus on React hooks with practical examples…"
              className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 mb-4 h-28 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
              autoFocus
            />
            {noRoadmap && (
              <p className="text-rose-400 text-xs mb-3 flex gap-1.5">
                <span>⚠</span><span>No active roadmap. Go to the Roadmap tab first.</span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowPrompt(false); setNoRoadmap(false) }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm" disabled={isBusy}>
                Cancel
              </button>
              {/* Streaming mode */}
              <button onClick={handleStreamGenerate} disabled={isBusy}
                title="See tokens appear in real-time"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {streaming ? 'Streaming…' : '⚡ Stream'}
              </button>
              {/* Sync mode */}
              <button onClick={handleGenerate} disabled={isBusy}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {generating ? 'Generating…' : '✦ Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Version history panel ─────────────────────────────── */}
      {showHistory && isMentor && (
        <div className="absolute inset-0 z-40 bg-black/50 flex items-center justify-end p-4 backdrop-blur-sm rounded-xl">
          <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-80 h-full flex flex-col p-4 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-white font-semibold capitalize">{selectedLevel} — History</h4>
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>
            {history.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
            ) : (
              <ol className="flex-1 overflow-y-auto space-y-2 pr-1">
                {history.map(v => (
                  <li key={v.version} className="p-3 rounded-lg bg-slate-800 border border-slate-700 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono text-sm">v{v.version}</span>
                        {v.isActive && <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded px-1.5 py-0.5">active</span>}
                      </div>
                      <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[v.status] || STATUS_BADGE.draft}`}>{v.status}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 space-y-0.5">
                      {v.generationMeta?.durationMs && <p>⏱ {(v.generationMeta.durationMs / 1000).toFixed(1)}s{v.generationMeta.attempts > 1 && ` · ${v.generationMeta.attempts} attempts`}</p>}
                      {v.generationMeta?.tokens  && <p>≈ {v.generationMeta.tokens} tokens</p>}
                      {v.llmModel               && <p>🤖 {v.llmModel}</p>}
                      {v.promptVersion           && <p>📝 prompt {v.promptVersion}</p>}
                      {v.qualityScore            && <p>★ {v.qualityScore}/5</p>}
                    </div>
                    <p className="text-slate-500 text-[11px]">
                      {new Date(v.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-start mb-5 flex-shrink-0 gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-xl font-semibold text-white">AI Content</h3>
            {version !== null && <span className="text-xs font-mono bg-slate-700 text-slate-300 rounded px-2 py-0.5 border border-slate-600">v{version}</span>}
            {status && <span className={`text-[11px] rounded-full px-2 py-0.5 ${STATUS_BADGE[status] || STATUS_BADGE.draft}`}>{status}</span>}
            {streaming && <span className="text-[11px] rounded-full px-2 py-0.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 animate-pulse">⚡ Streaming…</span>}
            {!streaming && genStatus && GEN_STATUS[genStatus] && (
              <span className={`text-[11px] rounded-full px-2 py-0.5 ${GEN_STATUS[genStatus].cls}`}>{GEN_STATUS[genStatus].label}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 uppercase tracking-wider">Level</span>
            <select value={selectedLevel} onChange={e => setSelectedLevel(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
              {LEVELS.map(l => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {/* Mentor action bar */}
        {isMentor && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowPrompt(true)} disabled={isBusy}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
              {isBusy && !streaming ? 'Generating…' : streaming ? '⚡ Streaming…' : '✦ Generate'}
            </button>
            <button onClick={handleSave} disabled={saving || isBusy}
              className="px-4 py-2 border border-slate-600 text-slate-300 rounded-lg text-sm hover:bg-slate-800 disabled:opacity-40">
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button onClick={handlePublish}
              disabled={publishing || isBusy || !hasContent || status === 'published'}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40"
              title={status === 'published' ? 'Already published — generate a new draft to re-publish' : 'Publish to mentee'}>
              {publishing ? 'Publishing…' : status === 'published' ? '✓ Published' : 'Publish'}
            </button>
            <button onClick={() => { setShowHistory(true); fetchHistory() }}
              className="px-3 py-2 border border-slate-700 text-slate-400 rounded-lg text-sm hover:bg-slate-800" title="Version history">
              ⏱ History
            </button>
          </div>
        )}
      </div>

      {/* ── Status banners ───────────────────────────────────────── */}
      {isMentor && streaming && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 rounded-lg mb-4 text-sm flex-shrink-0 bg-purple-500/10 border border-purple-500/20 text-purple-300">
          <div className="flex items-center gap-2">
            <span className="animate-pulse text-base">⚡</span>
            <span>Streaming tokens from Ollama in real-time…</span>
          </div>
          <button onClick={handleCancelStream} className="px-3 py-1 bg-red-500/20 text-red-300 hover:bg-red-500/30 font-medium text-xs rounded border border-red-500/30">
            Cancel
          </button>
        </div>
      )}
      {isMentor && !streaming && (isGenerating || hasFailed) && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg mb-4 text-sm flex-shrink-0 ${isGenerating ? 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300' : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'}`}>
          {isGenerating
            ? <><span className="animate-spin">⟳</span> AI is generating content…</>
            : <><span>✕</span> Generation failed. Try again or check if Ollama is running.</>
          }
        </div>
      )}

      {/* ── Quality star rating ──────────────────────────────────── */}
      {isMentor && hasContent && !isBusy && (
        <div className="flex items-center gap-2 mb-4 flex-shrink-0">
          <span className="text-xs text-slate-400">Quality:</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => handleRate(n)} disabled={rating} title={STAR_LABELS[n]}
              className={`text-lg transition-colors disabled:cursor-wait ${n <= (qualityScore || 0) ? 'text-amber-400' : 'text-slate-600 hover:text-amber-300'}`}>
              ★
            </button>
          ))}
          {qualityScore && <span className="text-xs text-amber-300 ml-1">{STAR_LABELS[qualityScore]}</span>}
        </div>
      )}

      {/* ── Content area ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
        {loading ? (
          <ContentSkeleton />
        ) : isGenerating ? (
          <StreamingPreview text={streamText || 'Connecting to AI generation stream...'} />
        ) : (!safeContent || typeof safeContent !== 'object' || !hasContent) ? (
          <EmptyState level={selectedLevel} isMentor={isMentor} isGenerating={false} hasFailed={hasFailed} />
        ) : (
          <>
            <Section label="Explanation" accent="text-indigo-400" isMentor={isMentor}
              text={isMentor ? currentEdit.explanation : current.explanation}
              onChangeText={val => setEditMap(prev => ({ ...prev, [normalizedLevel]: { ...currentEdit, explanation: val } }))}
              placeholder="Explanation will appear after generation…" minRows={4} />
            <ListSection label="Examples" accent="text-emerald-400" bullet="▸" isMentor={isMentor}
              items={isMentor ? currentEdit.examples : current.examples}
              onChangeItems={arr => setEditMap(prev => ({ ...prev, [normalizedLevel]: { ...currentEdit, examples: arr } }))}
              emptyText="No examples provided." placeholder="One example per line…" />
            <ResourceSection isMentor={isMentor}
              items={isMentor ? currentEdit.resources : current.resources}
              onChangeItems={arr => setEditMap(prev => ({ ...prev, [normalizedLevel]: { ...currentEdit, resources: arr } }))} />
          </>
        )}
      </div>
    </div>
  )
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function ContentSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[80, 40, 40].map((_, i) => (
        <div key={i} className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="h-3 w-24 bg-slate-700 rounded mb-3" />
          <div className="h-16 bg-slate-700/60 rounded" />
        </div>
      ))}
    </div>
  )
}

/** Live streaming preview — shows raw tokens as they arrive from Ollama */
function StreamingPreview({ text }) {
  return (
    <div className="bg-slate-800/50 border border-purple-500/20 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Live Generation</span>
        <span className="text-purple-400 animate-pulse">●</span>
      </div>
      <pre className="text-slate-200 text-sm leading-relaxed font-mono whitespace-pre-wrap break-words">
        {text}
        <span className="animate-pulse text-purple-400">▌</span>
      </pre>
    </div>
  )
}

function EmptyState({ level, isMentor, isGenerating, hasFailed }) {
  if (isGenerating) return (
    <div className="flex flex-col items-center justify-center h-40 gap-3">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-indigo-300 text-sm">AI is working on <span className="capitalize font-medium">{level}</span> content…</p>
    </div>
  )
  if (hasFailed) return (
    <div className="flex flex-col items-center justify-center h-40 text-rose-400 text-sm gap-2">
      <span className="text-2xl">⚠</span>
      <p>Generation failed. Try again or check if Ollama is running.</p>
    </div>
  )
  return (
    <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-sm gap-2">
      <span>No {isMentor ? 'draft' : 'published'} content for <strong className="capitalize">{level}</strong> yet.</span>
      {isMentor && <span className="text-xs text-indigo-400">Click <strong>✦ Generate</strong> to create with AI.</span>}
    </div>
  )
}

function Section({ label, accent, isMentor, text, onChangeText, placeholder, minRows = 3 }) {
  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${accent}`}>{label}</h4>
      {isMentor
        ? <textarea value={text || ''} onChange={e => onChangeText(e.target.value)}
            className="w-full bg-transparent text-slate-200 text-sm leading-relaxed focus:outline-none resize-none placeholder-slate-600"
            style={{ minHeight: `${minRows * 1.6}rem` }} placeholder={placeholder} />
        : <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
      }
    </section>
  )
}

function ListSection({ label, accent, bullet, isMentor, items, onChangeItems, emptyText, placeholder }) {
  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${accent}`}>{label}</h4>
      {isMentor
        ? <textarea value={(items || []).join('\n')}
            onChange={e => onChangeItems(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
            className="w-full bg-transparent text-slate-200 text-sm leading-relaxed focus:outline-none resize-none placeholder-slate-600 min-h-[3rem]"
            placeholder={placeholder} />
        : <ul className="space-y-1">
            {(items || []).length > 0
              ? items.map((item, i) => <li key={i} className="flex gap-2 text-sm text-slate-300"><span className={accent}>{bullet}</span><span>{item}</span></li>)
              : <li className="text-slate-500 text-sm italic">{emptyText}</li>}
          </ul>
      }
    </section>
  )
}

function ResourceSection({ isMentor, items, onChangeItems }) {
  return (
    <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <h4 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Resources</h4>
      {isMentor
        ? <textarea value={(items || []).join('\n')}
            onChange={e => onChangeItems(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
            className="w-full bg-transparent text-slate-200 text-sm leading-relaxed focus:outline-none resize-none placeholder-slate-600 min-h-[3rem]"
            placeholder="One resource URL or book title per line…" />
        : <ul className="space-y-1.5">
            {(items || []).length > 0
              ? items.map((r, i) => (
                  <li key={i} className="text-sm">
                    {r.startsWith('http')
                      ? <a href={r} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline break-all">{r}</a>
                      : <span className="text-slate-300">📖 {r}</span>}
                  </li>
                ))
              : <li className="text-slate-500 text-sm italic">No resources provided.</li>}
          </ul>
      }
    </section>
  )
}
