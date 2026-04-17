// frontend/src/pages/mentor/MentorWallet.jsx
// Part 6: Mentor wallet page — shows walletPoints, lockedPoints, withdrawal history,
//         and the withdraw flow (UPI entry → pending → admin approval → payout).
import { useState, useEffect } from 'react'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'
import Header from '../../components/Header'
import AppSidebar from '../../components/AppSidebar'
import ToastContainer, { showToast } from '../../components/Toast'
import { motion } from 'framer-motion'

// Part 6 — status badge config
const STATUS_BADGE = {
  pending:    { label: '⏳ Waiting for approval', cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  processing: { label: '💸 Sending via Razorpay', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  completed:  { label: '✅ Paid',                  cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  failed:     { label: '❌ Refunded',              cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
}

export default function MentorWallet() {
  const { user } = useAuth()

  const [wallet,        setWallet]        = useState(null)
  const [transactions,  setTransactions]  = useState([])
  const [loadingWallet, setLoadingWallet] = useState(true)
  const [loadingTx,     setLoadingTx]     = useState(true)

  // Withdraw form state
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [amount,       setAmount]       = useState('')
  const [upiId,        setUpiId]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [submitting,   setSubmitting]   = useState(false)

  useEffect(() => {
    fetchWallet()
    fetchTransactions()
  }, [])

  const fetchWallet = async () => {
    setLoadingWallet(true)
    try {
      const res = await api.get('/api/wallet/me')
      setWallet(res.data)
    } catch {
      showToast('Failed to load wallet', 'error')
    } finally {
      setLoadingWallet(false)
    }
  }

  const fetchTransactions = async () => {
    setLoadingTx(true)
    try {
      const res = await api.get('/api/wallet/transactions')
      setTransactions(res.data.transactions || [])
    } catch {
      // silent
    } finally {
      setLoadingTx(false)
    }
  }

  // Part 2: Submit withdrawal request
  const handleWithdraw = async (e) => {
    e.preventDefault()
    if (!amount || Number(amount) < 100) {
      showToast('Minimum withdrawal is 100 points', 'error')
      return
    }
    // Client-side balance guard (server also validates)
    const integerAmount = Math.round(Number(amount) * 100)
    if (integerAmount > wp) {
      showToast(`Insufficient balance. You have ₹${(wp / 100).toFixed(2)} available.`, 'error')
      return
    }
    if (!upiId.includes('@')) {
      showToast('Enter a valid UPI ID (e.g. name@upi)', 'error')
      return
    }
    if (!phone || phone.length < 10) {
      showToast('Enter a valid phone number', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await api.post('/api/wallet/withdraw', {
        amount: Number(amount),
        upiId,
        phone,
      })
      showToast(res.data.message || 'Withdrawal request submitted!', 'success')
      setShowWithdraw(false)
      setAmount('')
      await fetchWallet()
      await fetchTransactions()
    } catch (err) {
      showToast(err.response?.data?.message || 'Withdrawal failed', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const wp = wallet?.walletPoints ?? 0
  const lp = wallet?.lockedPoints ?? 0
  const rp = wallet?.rewardPoints ?? 0

  const withdrawals = transactions.filter(t => t.reason === 'withdrawal')

  return (
    <>
      <Header />
      <div className="flex min-h-screen">
        <AppSidebar userRole="mentor" />
        <main className="flex-1 px-6 py-8 space-y-8">
          <ToastContainer />

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h2 className="text-2xl font-semibold text-white mb-1">Wallet & Withdrawals</h2>
            <p className="text-sm text-slate-400">Manage your earnings and request payouts</p>
          </motion.div>

          {/* ── Balance Cards ─────────────────────────────────────────────────── */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Withdrawable Balance */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-xl shadow-xl flex flex-col gap-3">
              <p className="text-sm text-slate-400">Withdrawable Balance</p>
              <p className="text-4xl font-bold text-emerald-300 tabular-nums">
                ₹{(wp / 100).toFixed(2)}
              </p>
              <p className="text-xs text-slate-500">Real money (INR-backed)</p>
              <button
                onClick={() => setShowWithdraw(true)}
                className="mt-auto py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Withdraw Funds
              </button>
            </div>

            {/* Locked Amount */}
            <div className="bg-white/5 border border-amber-500/20 rounded-2xl p-6 backdrop-blur-xl shadow-xl flex flex-col gap-3">
              <p className="text-sm text-slate-400">Locked (Pending Withdrawal)</p>
              <p className="text-4xl font-bold text-amber-300 tabular-nums">
                ₹{(lp / 100).toFixed(2)}
              </p>
              <p className="text-xs text-amber-600/70">Awaiting admin approval or Razorpay payout</p>
              <p className="text-xs text-slate-500 mt-auto">Refunded automatically if payout fails</p>
            </div>

            {/* Reward Points (display only) */}
            <div className="bg-white/5 border border-purple-500/10 rounded-2xl p-6 backdrop-blur-xl shadow-xl flex flex-col gap-3">
              <p className="text-sm text-slate-400">Reward Points</p>
              <p className="text-4xl font-bold text-purple-300 tabular-nums">
                {(rp / 100).toFixed(0)} pts
              </p>
              <p className="text-xs text-purple-500/70">Virtual · Not withdrawable</p>
              <p className="text-xs text-slate-500 mt-auto">Earned via milestones &amp; bonuses</p>
            </div>
          </section>

          {/* ── Withdrawal Form Modal ─────────────────────────────────────────── */}
          {showWithdraw && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
              <motion.form
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onSubmit={handleWithdraw}
                className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-5"
              >
                <h3 className="text-xl font-semibold text-white">Request Withdrawal</h3>
                <p className="text-xs text-slate-400">
                  Funds will be locked immediately. Admin approves → Razorpay sends to your UPI.
                </p>

                {/* Live balance summary inside modal */}
                <div className="flex gap-3 text-xs">
                  <div className="flex-1 bg-slate-800 rounded-xl p-3">
                    <p className="text-slate-400">Available</p>
                    <p className="text-emerald-300 font-semibold text-base">₹{(wp / 100).toFixed(2)}</p>
                  </div>
                  <div className="flex-1 bg-slate-800 rounded-xl p-3">
                    <p className="text-slate-400">Locked</p>
                    <p className="text-amber-300 font-semibold text-base">₹{(lp / 100).toFixed(2)}</p>
                  </div>
                </div>

                {wp < 10000 && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                    ⚠️ Minimum withdrawal is ₹100. Your current balance is ₹{(wp / 100).toFixed(2)}.
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Amount (in points, min 100)</label>
                    <input
                      type="number" min="100" step="1"
                      value={amount} onChange={e => setAmount(e.target.value)}
                      placeholder="e.g. 500"
                      className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                    {amount && (
                      <p className="text-xs text-emerald-400 mt-1">≈ ₹{(Number(amount)).toFixed(2)}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">UPI ID</label>
                    <input
                      type="text"
                      value={upiId} onChange={e => setUpiId(e.target.value)}
                      placeholder="yourname@upi"
                      className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Phone (linked to UPI)</label>
                    <input
                      type="tel"
                      value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowWithdraw(false)}
                    className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
                  >
                    {submitting ? 'Submitting...' : 'Request Withdrawal'}
                  </button>
                </div>
              </motion.form>
            </div>
          )}

          {/* ── Withdrawal History ────────────────────────────────────────────── */}
          <section>
            <h3 className="text-lg font-semibold text-white mb-4">Withdrawal History</h3>

            {loadingTx ? (
              <div className="text-slate-400 text-sm">Loading...</div>
            ) : withdrawals.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-slate-400 text-sm">
                No withdrawal records yet
              </div>
            ) : (
              <div className="space-y-3">
                {withdrawals.map(tx => {
                  const badge = STATUS_BADGE[tx.status] || { label: tx.status, cls: 'bg-slate-500/20 text-slate-300 border-slate-500/30' }
                  return (
                    <div
                      key={tx._id}
                      className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between gap-4 hover:bg-white/8 transition-colors"
                    >
                      <div>
                        <p className="text-white font-medium">₹{(tx.amount / 100).toFixed(2)}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </p>
                        {tx.payoutRef && (
                          <p className="text-xs text-slate-500 mt-0.5 font-mono">Payout: {tx.payoutRef}</p>
                        )}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs border whitespace-nowrap ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  )
}
