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
  
  // Wallet
  const [wallet, setWallet] = useState({ balance: 0, totalEarned: 0 })
  const [withdrawing, setWithdrawing] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', upiId: '', phone: '' })

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
      // Only show pending or price_set requests to mentor? No, mentor shouldn't re-action "price_set" items.
      const reqs = res.data.requests?.filter(r => r.status === 'pending') || []
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

  const fetchWallet = async () => {
    try {
      const res = await api.get('/api/wallet/me')
      setWallet({ 
        balance: ((res.data.wallet?.balance || 0) / 100).toFixed(2),
        totalEarned: ((res.data.wallet?.totalEarned || 0) / 100).toFixed(2)
      })
      updateUser?.({ points: ((res.data.wallet?.balance || 0) / 100).toFixed(2) })
    } catch (e) {
      console.error(e)
    }
  }

  const refreshDashboard = () => {
    fetchPendingRequests()
    fetchMentees()
    fetchWallet()
  }

  useEffect(() => {
    refreshDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRequestAction = async (requestId, action) => {
    try {
      setActionLoading(`${requestId}-${action}`)
      await api.post(`/api/mentorship/requests/${requestId}/${action}`)
      showToast(action === 'accept' ? 'Request accepted (Free)!' : 'Request rejected.', 'success')
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

  const handleSetPrice = async (requestId) => {
    const amountStr = prompt("Enter the point price for this Mentorship Course (e.g. 500):")
    if (!amountStr || isNaN(amountStr) || Number(amountStr) <= 0) return
    
    try {
      setActionLoading(`${requestId}-price`)
      await api.post(`/api/mentorship/requests/${requestId}/set-price`, { price: Number(amountStr) })
      showToast('Price set! Waiting for Mentee payment.', 'success')
      await fetchPendingRequests()
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to set price', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const submitWithdrawal = async () => {
    if (withdrawing) return
    const { amount, upiId, phone } = withdrawForm;
    const numAmount = Number(amount);

    if (!numAmount || numAmount < 100) {
      showToast('Minimum withdrawal is 100 pts', 'error')
      return
    }
    if (numAmount > wallet.balance) {
      showToast('Insufficient balance', 'error')
      return
    }
    if (!upiId || !phone) {
      showToast('UPI ID and Phone are clearly required', 'error')
      return
    }

    setWithdrawing(true)
    try {
      await api.post('/api/wallet/withdraw', { amount: numAmount, upiId, phone })
      showToast('Withdrawal successful! Payout generated safely.', 'success')
      setShowWithdrawModal(false)
      setWithdrawForm({ amount: '', upiId: '', phone: '' })
      fetchWallet()
    } catch (err) {
       showToast(err.response?.data?.message || 'Withdrawal failed', 'error')
    } finally {
      setWithdrawing(false)
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
              <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 flex items-center justify-between hover:scale-[1.02] transition-all duration-200 shadow-xl">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-2xl">
                    ⭐
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Total Earned</p>
                    <p className="text-3xl font-semibold text-amber-300 tabular-nums">{wallet.totalEarned}</p>
                    <p className="text-xs text-slate-500 mt-1">Available Balance: {wallet.balance}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowWithdrawModal(true)}
                  disabled={withdrawing || wallet.balance < 100}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl disabled:opacity-50 text-sm transition-colors cursor-pointer"
                >
                  Withdraw
                </button>
              </div>
            </>
          )}
        </section>

        {/* Withdraw Modal overlay */}
        {showWithdrawModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="max-w-md w-full mx-4 text-slate-100 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-8">
              <h3 className="text-xl font-semibold mb-4 text-white">Withdraw Funds (UPI)</h3>
              <p className="text-sm text-slate-400 mb-6">Minimum withdrawal is 100 pts. Funds are routed directly via Razorpay Payouts.</p>
              
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount (Max: {wallet.balance})</label>
                  <input
                    type="number"
                    placeholder="E.g. 500"
                    value={withdrawForm.amount}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">UPI ID</label>
                  <input
                    type="text"
                    placeholder="name@upi"
                    value={withdrawForm.upiId}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, upiId: e.target.value })}
                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Phone Number (Required by Bank)</label>
                  <input
                    type="text"
                    placeholder="10 digit format"
                    value={withdrawForm.phone}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, phone: e.target.value })}
                    className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowWithdrawModal(false)}
                  className="px-4 py-2 border border-slate-700 rounded-xl hover:bg-white/5 transition-colors text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={submitWithdrawal}
                  disabled={withdrawing}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {withdrawing ? 'Processing...' : 'Submit Payout'}
                </button>
              </div>
            </Card>
          </div>
        )}

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
                    <div className='flex flex-wrap gap-2 md:justify-end'>
                      <button
                        onClick={() => handleRequestAction(req._id, 'accept')}
                        disabled={actionLoading === `${req._id}-accept`}
                        className='px-3 py-1.5 text-sm bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-60 transition-colors'
                      >
                        {actionLoading === `${req._id}-accept` ? 'Accepting...' : 'Accept Free'}
                      </button>
                      <button
                        onClick={() => handleSetPrice(req._id)}
                        disabled={actionLoading === `${req._id}-price`}
                        className='px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors'
                      >
                        {actionLoading === `${req._id}-price` ? 'Setting...' : 'Set Price'}
                      </button>
                      <button
                        onClick={() => handleRequestAction(req._id, 'reject')}
                        disabled={actionLoading === `${req._id}-reject`}
                        className='px-3 py-1.5 text-sm bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 hover:text-red-300 disabled:opacity-60 transition-colors'
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
