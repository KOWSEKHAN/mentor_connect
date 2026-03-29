import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Card from '../../components/Card'
import Skeleton from '../../components/ui/Skeleton'
import AppSidebar from '../../components/AppSidebar'
import FloatingActionButton from '../../components/FloatingActionButton'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'
import { showToast } from '../../components/Toast'
import { motion } from 'framer-motion'

const STATS_CONFIG = [
  {
    key: 'active',
    label: 'Active Mentees',
    icon: '🟢',
    textClass: 'text-green-700'
  },
  {
    key: 'completed',
    label: 'Completed Mentees',
    icon: '🏁',
    textClass: 'text-gray-700'
  },
  {
    key: 'pending',
    label: 'Pending Requests',
    icon: '📩',
    textClass: 'text-blue-700'
  }
]

export default function MentorDashboard () {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState({ active: 0, completed: 0, pending: 0 })
  const [pendingRequests, setPendingRequests] = useState([])
  const [mentees, setMentees] = useState([])
  const [loading, setLoading] = useState({ requests: false, mentees: false })
  const [actionLoading, setActionLoading] = useState(null)

  const updateStatsCounts = useCallback((data, type) => {
    if (type === 'requests') {
      setStats(prev => ({ ...prev, pending: data.length }))
      return
    }
    const completedCount = data.filter(ms => ms.status === 'completed').length
    const activeCount = data.filter(ms => ms.status !== 'completed').length
    setStats(prev => ({ ...prev, active: activeCount, completed: completedCount }))
  }, [])

  const fetchPendingRequests = useCallback(async () => {
    setLoading(prev => ({ ...prev, requests: true }))
    try {
      const res = await api.get('/api/mentorship/requests')
      const reqs = res.data.requests || []
      setPendingRequests(reqs)
      updateStatsCounts(reqs, 'requests')
    } catch (err) {
      console.error(err)
      showToast('Failed to load pending requests', 'error')
    } finally {
      setLoading(prev => ({ ...prev, requests: false }))
    }
  }, [updateStatsCounts])

  const fetchMentees = useCallback(async () => {
    setLoading(prev => ({ ...prev, mentees: true }))
    try {
      // Use /api/mentorships/mentor endpoint (single source of truth)
      const res = await api.get('/api/mentorships/mentor')
      const menteeList = res.data.mentorships || []
      setMentees(menteeList)
      updateStatsCounts(menteeList, 'mentees')
    } catch (err) {
      console.error(err)
      showToast('Failed to load mentees', 'error')
    } finally {
      setLoading(prev => ({ ...prev, mentees: false }))
    }
  }, [updateStatsCounts])

  const refreshDashboard = useCallback(() => {
    fetchPendingRequests()
    fetchMentees()
  }, [fetchPendingRequests, fetchMentees])

  useEffect(() => {
    refreshDashboard()
  }, [refreshDashboard])

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/points/summary')
      .then((res) => {
        if (cancelled) return
        updateUser?.({ points: res.data?.balance ?? 0 })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleRequestAction = async (requestId, action) => {
    try {
      setActionLoading(`${requestId}-${action}`)
      await api.post(`/api/mentorship/requests/${requestId}/${action}`)
      showToast(action === 'accept' ? 'Request accepted!' : 'Request rejected.', 'success')
      // Refetch both pending requests and active mentees after accepting
      await fetchPendingRequests()
      await fetchMentees()
    } catch (err) {
      console.error(err)
      const msg = err.response?.data?.message || `Failed to ${action} request`
      showToast(msg, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const handleOpenMentee = mentorship => {
    const mentorshipId = mentorship._id
    if (!mentorshipId) {
      showToast('Unable to open workspace — missing mentorship id', 'error')
      return
    }
    navigate(`/mentor/workspace/${mentorshipId}`)
  }

  const hasPendingRequests = pendingRequests.length > 0
  const hasMentees = mentees.length > 0

  return (
    <>
      <Header />
      <div className="flex min-h-screen">
        <AppSidebar userRole="mentor" />
        <main className="flex-1 w-full min-h-screen px-6 py-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
          >
        <h2 className="text-2xl font-semibold text-slate-100">Hello, {user?.name}</h2>

        {/* Analytics */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {(loading.requests && loading.mentees) ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            ))
          ) : (
            <>
              {STATS_CONFIG.map(stat => (
                <div
                  key={stat.key}
                  className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 flex items-center gap-4 hover:scale-[1.02] transition-all duration-200 shadow-xl"
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-700/80 flex items-center justify-center text-2xl">
                    {stat.icon}
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">{stat.label}</p>
                    <p className="text-3xl font-semibold text-white">{stats[stat.key]}</p>
                  </div>
                </div>
              ))}
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 flex items-center gap-4 hover:scale-[1.02] transition-all duration-200 shadow-xl">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-2xl">
                  ⭐
                </div>
                <div>
                  <p className="text-sm text-slate-400">Points balance</p>
                  <p className="text-3xl font-semibold text-amber-300 tabular-nums">{user?.points ?? 0}</p>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Section 2: Pending Requests */}
        <section className='mb-8'>
          <Card className="text-slate-100 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl">
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-xl font-semibold text-white'>Pending Requests</h3>
              {loading.requests && <span className='text-sm text-slate-400'>Refreshing...</span>}
            </div>
            {hasPendingRequests ? (
              <div className='space-y-4'>
                {pendingRequests.map(req => (
                  <div
                    key={req._id}
                    className='border border-slate-700 rounded-xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between bg-slate-800/30'
                  >
                    <div>
                      <div className='font-semibold text-lg text-slate-200'>
                        {req.mentee?.name || 'Unknown mentee'}
                      </div>
                      <div className='text-sm text-slate-400'>
                        {req.domain || 'General domain'}
                      </div>
                      {req.message && (
                        <p className='text-sm text-slate-400 mt-2'>
                          Goal: {req.message}
                        </p>
                      )}
                    </div>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => handleRequestAction(req._id, 'accept')}
                        disabled={actionLoading === `${req._id}-accept`}
                        className='px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-60 transition-colors'
                      >
                        {actionLoading === `${req._id}-accept` ? 'Accepting...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleRequestAction(req._id, 'reject')}
                        disabled={actionLoading === `${req._id}-reject`}
                        className='px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 disabled:opacity-60 transition-colors'
                      >
                        {actionLoading === `${req._id}-reject` ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center text-slate-500 py-8'>
                No pending requests 🎉
              </div>
            )}
          </Card>
        </section>

        {/* Section 3: Active / Completed Mentees */}
        <section>
          <Card className="text-slate-100 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl">
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-xl font-semibold text-white'>Accepted / Active Mentees</h3>
              {loading.mentees && <span className='text-sm text-slate-400'>Refreshing...</span>}
            </div>
            {hasMentees ? (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {mentees.map(mentorship => {
                  const statusIsCompleted = mentorship.status === 'completed'
                  return (
                    <div
                      key={mentorship._id}
                      onClick={() => handleOpenMentee(mentorship)}
                      className='border border-slate-700 rounded-2xl p-4 hover:scale-[1.02] transition-transform duration-200 cursor-pointer bg-slate-800/30'
                    >
                      <div className='flex items-center justify-between mb-3'>
                        <h4 className='text-lg font-semibold text-slate-200'>
                          {mentorship.mentee?.name || 'Unnamed mentee'}
                        </h4>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            statusIsCompleted
                              ? 'bg-slate-700 text-slate-300'
                              : 'bg-green-600/30 text-green-400'
                          }`}
                        >
                          {statusIsCompleted ? 'Completed' : 'Active'}
                        </span>
                      </div>
                      <p className='text-sm text-slate-400'>
                        Domain: {mentorship.domain || 'General'}
                      </p>
                      <p className='text-sm text-slate-500 mt-2'>
                        Progress: {mentorship.progress ?? 0}%
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className='text-center text-slate-500 py-8'>
                No active mentees yet. Accept a request to get started!
              </div>
            )}
          </Card>
        </section>
          </motion.div>
        </main>
        <FloatingActionButton userRole="mentor" />
      </div>
      <Footer />
    </>
  )
}
