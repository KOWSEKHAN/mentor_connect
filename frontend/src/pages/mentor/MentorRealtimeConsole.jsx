import { useCallback, useEffect, useState } from 'react'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import AppSidebar from '../../components/AppSidebar'
import api from '../../utils/api'
import { showToast } from '../../components/Toast'

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-white">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export default function MentorRealtimeConsole() {
  const [tab, setTab] = useState('ops')
  const [dash, setDash] = useState(null)
  const [dashErr, setDashErr] = useState(null)

  const [courseId, setCourseId] = useState('')
  const [timeline, setTimeline] = useState(null)
  const [loadingTl, setLoadingTl] = useState(false)
  const [compareVersion, setCompareVersion] = useState('')
  const [stateAt, setStateAt] = useState(null)
  const [loadingState, setLoadingState] = useState(false)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await api.get('/api/realtime/dashboard')
      setDash(res.data)
      setDashErr(null)
    } catch (e) {
      setDashErr(e.response?.data?.message || e.message)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'ops') return undefined
    fetchDashboard()
    const id = setInterval(fetchDashboard, 2000)
    return () => clearInterval(id)
  }, [tab, fetchDashboard])

  const loadTimeline = async () => {
    if (!courseId.trim()) {
      showToast('Enter a course ID', 'error')
      return
    }
    setLoadingTl(true)
    try {
      const res = await api.get(`/api/realtime/timeline/${encodeURIComponent(courseId.trim())}`, {
        params: { limit: 200 },
      })
      setTimeline(res.data)
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to load timeline', 'error')
    } finally {
      setLoadingTl(false)
    }
  }

  const exportJson = async () => {
    if (!courseId.trim()) {
      showToast('Enter a course ID', 'error')
      return
    }
    try {
      const res = await api.get('/api/realtime/export', {
        params: { courseId: courseId.trim() },
      })
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mentorconnect-course-${courseId.trim()}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Export downloaded', 'success')
    } catch (e) {
      showToast(e.response?.data?.message || 'Export failed', 'error')
    }
  }

  const loadStateAtVersion = async () => {
    const v = Number(compareVersion)
    if (!courseId.trim() || !Number.isFinite(v)) {
      showToast('Course ID and numeric version required', 'error')
      return
    }
    setLoadingState(true)
    try {
      const res = await api.get('/api/realtime/state-at-version', {
        params: { courseId: courseId.trim(), version: v },
      })
      setStateAt(res.data)
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to load state', 'error')
    } finally {
      setLoadingState(false)
    }
  }

  const replay = async (eventId) => {
    try {
      await api.post('/api/realtime/replay', { courseId: courseId.trim(), eventId })
      showToast('Event re-emitted to room', 'success')
    } catch (e) {
      showToast(e.response?.data?.message || 'Replay failed', 'error')
    }
  }

  const c = dash?.counters || {}
  const sockets = dash?.sockets || {}
  const eps = dash?.eventsPerSecond || {}
  const chaos = dash?.chaosEmits || {}
  const ai = dash?.ai || {}

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200">
      <AppSidebar userRole="mentor" />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Realtime console</h1>
            <p className="mt-1 text-sm text-slate-400">
              Live operations metrics, event log, replay, export, and version inspection for demos and debugging.
            </p>
          </div>

          <div className="mb-6 flex gap-2">
            {[
              ['ops', 'Live ops'],
              ['debug', 'Course debug'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === id ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'ops' && (
            <div className="space-y-6">
              {dash?.chaosMode && (
                <div className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100">
                  <strong>CHAOS_MODE</strong> is enabled on the server — expect delayed / dropped / reordered emits and random
                  disconnects (demo only).
                </div>
              )}
              {dashErr && (
                <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">{dashErr}</div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Engine clients (Socket.IO)" value={sockets.engineClients ?? '—'} />
                <StatCard label="Active mentorship rooms" value={sockets.activeMentorshipRooms ?? '—'} />
                <StatCard label="Tracked active sockets (counter)" value={c.active_socket_connections ?? 0} />
                <StatCard label="Events / sec (1s window)" value={eps.last1s ?? 0} sub={`${eps.last60s ?? 0} in last 60s window`} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Avg emit latency (persist + fan-out)" value={`${dash?.emitLatencyAvgMs ?? 0} ms`} />
                <StatCard label="Reconnect hints (client ack)" value={dash?.reconnectHints ?? 0} />
                <StatCard label="Sync API calls" value={dash?.syncApiCalls ?? 0} />
                <StatCard label="Dropped emits (chaos)" value={dash?.droppedEvents ?? 0} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Chaos duplicate emits" value={chaos.duplicate ?? 0} />
                <StatCard label="Chaos reordered emits" value={chaos.reordered ?? 0} />
                <StatCard label="Chaos forced disconnects" value={chaos.forcedDisconnects ?? 0} />
                <StatCard label="Replay emits" value={c.replay_emits ?? 0} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="AI calls" value={ai.calls ?? 0} />
                <StatCard label="AI failures (recorded)" value={ai.failures ?? 0} />
                <StatCard label="AI fallbacks (incl. roadmap)" value={ai.fallbacks ?? 0} />
                <StatCard label="AI avg latency" value={`${ai.latencyAvgMs ?? 0} ms`} sub={`${ai.latencySamples ?? 0} samples`} />
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs text-slate-500">
                <div>Redis adapter: {dash?.redis ? 'enabled' : 'disabled'}</div>
                <div>Uptime: {dash?.uptimeSec ?? 0}s</div>
                <div>Snapshot: {dash?.timestamp || '—'}</div>
              </div>
            </div>
          )}

          {tab === 'debug' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-slate-400">Course ID</span>
                  <input
                    value={courseId}
                    onChange={(e) => setCourseId(e.target.value)}
                    placeholder="Mongo ObjectId"
                    className="min-w-[260px] rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={loadTimeline}
                  disabled={loadingTl}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {loadingTl ? 'Loading…' : 'Load timeline'}
                </button>
                <button
                  type="button"
                  onClick={exportJson}
                  className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
                >
                  Export JSON
                </button>
              </div>

              {timeline && (
                <div>
                  <div className="mb-2 text-sm text-slate-400">
                    Current version: <span className="text-white">{timeline.currentVersion}</span> — showing {timeline.events?.length || 0}{' '}
                    events
                  </div>
                  <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-800">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Ver</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Actor</th>
                          <th className="px-3 py-2">Time</th>
                          <th className="px-3 py-2">eventId</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {(timeline.events || []).map((ev) => (
                          <tr key={ev.eventId} className="border-t border-slate-800/80">
                            <td className="px-3 py-2 font-mono text-slate-300">{ev.version}</td>
                            <td className="px-3 py-2 text-indigo-300">{ev.type}</td>
                            <td className="px-3 py-2 text-slate-400">{ev.actorRole || '—'}</td>
                            <td className="px-3 py-2 text-xs text-slate-500">
                              {ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '—'}
                            </td>
                            <td className="max-w-[180px] truncate px-3 py-2 font-mono text-xs text-slate-500">{ev.eventId}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => replay(ev.eventId)}
                                className="text-xs text-indigo-400 hover:underline"
                              >
                                Replay
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-lg font-semibold text-white">Time-travel (state at version)</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Loads baseline snapshot ≤ version, events through that version, and the current live snapshot for comparison.
                </p>
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-400">Version N</span>
                    <input
                      value={compareVersion}
                      onChange={(e) => setCompareVersion(e.target.value)}
                      placeholder="e.g. 12"
                      className="w-32 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={loadStateAtVersion}
                    disabled={loadingState}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {loadingState ? 'Loading…' : 'Load'}
                  </button>
                </div>
                {stateAt && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-500">Baseline snapshot (≤ N)</div>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                        {JSON.stringify(stateAt.baselineSnapshot, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-500">Current live snapshot</div>
                      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                        {JSON.stringify(stateAt.currentLiveSnapshot, null, 2)}
                      </pre>
                    </div>
                    <div className="lg:col-span-2">
                      <div className="mb-1 text-xs font-medium text-slate-500">Events through version {stateAt.requestedVersion}</div>
                      <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
                        {JSON.stringify(stateAt.eventsThrough, null, 2)}
                      </pre>
                      <p className="mt-2 text-xs text-slate-500">{stateAt.note}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
        <Footer />
      </div>
    </div>
  )
}
