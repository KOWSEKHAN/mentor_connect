import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Card from '../../components/Card'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'
import { showToast } from '../../components/Toast'

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
  const { user } = useAuth()
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
      const res = await api.get('/api/mentorships/mentor?status=all')
      const menteeList = res.data.mentees || []
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
    const menteeId = mentorship.mentee?._id || mentorship.mentee
    if (!menteeId) {
      showToast('Unable to open workspace — missing mentee id', 'error')
      return
    }
    navigate(`/mentor/workspace/${menteeId}`)
  }

  const hasPendingRequests = pendingRequests.length > 0
  const hasMentees = mentees.length > 0

  return (
    <>
      <Header />
      <main className='max-w-6xl mx-auto p-6'>
        <h2 className='text-2xl font-semibold mb-6'>Hello, {user?.name} (Mentor)</h2>

        {/* Section 1: Statistics */}
        <section className='grid grid-cols-1 md:grid-cols-3 gap-4 mb-8'>
          {STATS_CONFIG.map(stat => (
            <div
              key={stat.key}
              className='bg-white rounded-2xl shadow p-4 flex items-center gap-4'
            >
              <div className='w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-2xl'>
                {stat.icon}
              </div>
              <div>
                <p className='text-sm text-gray-500'>{stat.label}</p>
                <p className={`text-3xl font-semibold ${stat.textClass}`}>
                  {stats[stat.key]}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Section 2: Pending Requests */}
        <section className='mb-8'>
          <Card>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-xl font-semibold'>Pending Requests</h3>
              {loading.requests && <span className='text-sm text-gray-500'>Refreshing...</span>}
            </div>
            {hasPendingRequests ? (
              <div className='space-y-4'>
                {pendingRequests.map(req => (
                  <div
                    key={req._id}
                    className='border rounded-xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between'
                  >
                    <div>
                      <div className='font-semibold text-lg'>
                        {req.mentee?.name || 'Unknown mentee'}
                      </div>
                      <div className='text-sm text-gray-500'>
                        {req.domain || 'General domain'}
                      </div>
                      {req.message && (
                        <p className='text-sm text-gray-600 mt-2'>
                          Goal: {req.message}
                        </p>
                      )}
                    </div>
                    <div className='flex gap-2'>
                      <button
                        onClick={() => handleRequestAction(req._id, 'accept')}
                        disabled={actionLoading === `${req._id}-accept`}
                        className='px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60'
                      >
                        {actionLoading === `${req._id}-accept` ? 'Accepting...' : 'Accept'}
                      </button>
                      <button
                        onClick={() => handleRequestAction(req._id, 'reject')}
                        disabled={actionLoading === `${req._id}-reject`}
                        className='px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-60'
                      >
                        {actionLoading === `${req._id}-reject` ? 'Rejecting...' : 'Reject'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className='text-center text-gray-500 py-8'>
                No pending requests 🎉
              </div>
            )}
          </Card>
        </section>

        {/* Section 3: Active / Completed Mentees */}
        <section>
          <Card>
            <div className='flex items-center justify-between mb-4'>
              <h3 className='text-xl font-semibold'>Accepted / Active Mentees</h3>
              {loading.mentees && <span className='text-sm text-gray-500'>Refreshing...</span>}
            </div>
            {hasMentees ? (
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                {mentees.map(mentorship => {
                  const statusIsCompleted = mentorship.status === 'completed'
                  return (
                    <div
                      key={mentorship._id}
                      onClick={() => handleOpenMentee(mentorship)}
                      className='border rounded-2xl p-4 hover:shadow-md transition cursor-pointer bg-gray-50'
                    >
                      <div className='flex items-center justify-between mb-3'>
                        <h4 className='text-lg font-semibold'>
                          {mentorship.mentee?.name || 'Unnamed mentee'}
                        </h4>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            statusIsCompleted
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {statusIsCompleted ? 'Completed' : 'Active'}
                        </span>
                      </div>
                      <p className='text-sm text-gray-600'>
                        Domain: {mentorship.domain || 'General'}
                      </p>
                      <p className='text-sm text-gray-500 mt-2'>
                        Progress: {mentorship.progress ?? 0}%
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className='text-center text-gray-500 py-8'>
                No active mentees yet. Accept a request to get started!
              </div>
            )}
          </Card>
        </section>
      </main>
      <Footer />
    </>
  )
}
