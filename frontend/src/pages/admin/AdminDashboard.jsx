import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../utils/auth'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import { motion, AnimatePresence } from 'framer-motion'

/* ─── tiny helpers ─────────────────────────────────────────────────────────── */
const fmt   = (n)  => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
const pts   = (n)  => `${(Number(n ?? 0) / 100).toFixed(0)} pts`
const badge = (status) => {
  const map = {
    completed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    processing:'bg-blue-500/20 text-blue-300 border-blue-500/30',
    pending:   'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    failed:    'bg-red-500/20 text-red-300 border-red-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${map[status] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
      {status}
    </span>
  )
}

const roleBadge = (role) => {
  const map = {
    admin:  'bg-purple-500/20 text-purple-300 border-purple-500/30',
    mentor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    mentee: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${map[role] ?? 'bg-slate-500/20 text-slate-300'}`}>
      {role}
    </span>
  )
}

const StatCard = ({ label, value, sub, color = 'indigo' }) => {
  const colors = {
    indigo: 'from-indigo-500/20 to-indigo-600/10 border-indigo-500/20',
    emerald:'from-emerald-500/20 to-emerald-600/10 border-emerald-500/20',
    amber:  'from-amber-500/20 to-amber-600/10 border-amber-500/20',
    rose:   'from-rose-500/20 to-rose-600/10 border-rose-500/20',
    purple: 'from-purple-500/20 to-purple-600/10 border-purple-500/20',
    cyan:   'from-cyan-500/20 to-cyan-600/10 border-cyan-500/20',
  }
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5 backdrop-blur-xl`}>
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

/* ─── confirmation modal ───────────────────────────────────────────────────── */
function ConfirmModal({ open, title, message, onConfirm, onCancel, danger = false, requireWord = null }) {
  const [typed, setTyped] = useState('')

  if (!open) return null

  const wordMatch = !requireWord || typed.trim().toUpperCase() === requireWord.toUpperCase()

  const handleConfirm = () => { setTyped(''); onConfirm() }
  const handleCancel  = () => { setTyped(''); onCancel()  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
      >
        <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400 mb-4">{message}</p>

        {/* Fix 5: typed word confirmation for sensitive actions */}
        {requireWord && (
          <div className="mb-5">
            <p className="text-xs text-rose-400 mb-2">
              Type <span className="font-mono font-bold tracking-widest">{requireWord}</span> to enable confirm:
            </p>
            <input
              autoFocus
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && wordMatch && handleConfirm()}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm font-mono focus:outline-none focus:border-rose-500 transition-colors"
              placeholder={requireWord}
            />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={handleCancel} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!wordMatch}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              danger ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            Confirm
          </button>
        </div>
      </motion.div>
    </div>
  )
}

/* ─── tabs ─────────────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'overview',      label: '📊 Overview' },
  { id: 'users',         label: '👥 Users' },
  { id: 'transactions',  label: '💳 Transactions' },
  { id: 'withdrawals',   label: '🏦 Withdrawals' },
  { id: 'courses',       label: '📚 Courses' },
  { id: 'audit',         label: '🧾 Audit Log' },
]

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab]       = useState('overview')
  const [toast, setToast]   = useState(null)
  const [confirm, setConfirm] = useState(null) // { title, message, onConfirm, danger }

  useEffect(() => {
    // Fix 2 (frontend): allow both admin and super_admin
    if (user && !['admin', 'super_admin'].includes(user.role)) navigate('/', { replace: true })
  }, [user, navigate])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  /* ── sub-pages ────────────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/10 flex flex-col py-8 px-4 gap-1">
        <div className="mb-6 px-2">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Admin</p>
          <p className="text-white font-semibold truncate">{user?.name}</p>
          <p className={`text-xs ${user?.role === 'super_admin' ? 'text-yellow-400' : 'text-purple-400'}`}>
            {user?.role === 'super_admin' ? '⭐ Super Admin' : 'Platform Admin'}
          </p>
        </div>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
              tab === t.id
                ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/30'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="mt-auto pt-4 border-t border-white/10">
          <button
            onClick={() => navigate('/')}
            className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to Platform
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto max-h-screen">
        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl border ${
                toast.type === 'error'
                  ? 'bg-red-900/80 text-red-200 border-red-700'
                  : 'bg-emerald-900/80 text-emerald-200 border-emerald-700'
              }`}
            >
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>

        <ConfirmModal
          open={!!confirm}
          title={confirm?.title}
          message={confirm?.message}
          danger={confirm?.danger}
          requireWord={confirm?.requireWord}
          onConfirm={() => { confirm?.onConfirm?.(); setConfirm(null) }}
          onCancel={() => setConfirm(null)}
        />

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {tab === 'overview'     && <OverviewTab showToast={showToast} />}
            {tab === 'users'        && <UsersTab showToast={showToast} setConfirm={setConfirm} />}
            {tab === 'transactions' && <TransactionsTab showToast={showToast} />}
            {tab === 'withdrawals'  && <WithdrawalsTab showToast={showToast} setConfirm={setConfirm} />}
            {tab === 'courses'      && <CoursesTab showToast={showToast} />}
            {tab === 'audit'        && <AuditTab showToast={showToast} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* OVERVIEW TAB                                                                */
/* ═══════════════════════════════════════════════════════════════════════════ */
function OverviewTab({ showToast }) {
  const [data, setData] = useState(null)
  const [fin,  setFin]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.get('/api/admin/overview'), api.get('/api/admin/financials')])
      .then(([o, f]) => { setData(o.data); setFin(f.data) })
      .catch(() => showToast('Failed to load overview', 'error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Skeleton />

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Platform Overview</h1>

      <section>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Users</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users"   value={data.users.total}   color="indigo" />
          <StatCard label="Mentors"        value={data.users.mentors}  color="purple" />
          <StatCard label="Mentees"        value={data.users.mentees}  color="cyan" />
          <StatCard label="Courses"        value={data.courses}        color="amber" />
        </div>
      </section>

      <section>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Financials</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="System Balance"   value={fmt(data.wallet.systemBalance)}   color="emerald" />
          <StatCard label="Total Recharged"  value={fmt(fin.totals.recharge)}         color="indigo" />
          <StatCard label="Total Paid Out"   value={fmt(fin.totals.payouts)}          color="rose" />
          <StatCard label="Pending Withdraw" value={data.pendingWithdrawals}           color="amber" sub="transactions" />
        </div>
      </section>

      {/* Daily recharge bar chart (CSS-based) */}
      {fin.dailyRecharge?.length > 0 && (
        <section>
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Daily Recharge (last 14 days)</p>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-end gap-2 h-28">
              {[...fin.dailyRecharge].reverse().map((d) => {
                const max = Math.max(...fin.dailyRecharge.map(x => x.amount), 1)
                const pct = Math.max((d.amount / max) * 100, 4)
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${fmt(d.amount)}`}>
                    <div className="w-full bg-indigo-500/60 rounded-t-sm hover:bg-indigo-400/80 transition-colors" style={{ height: `${pct}%` }} />
                    <p className="text-[9px] text-slate-500 rotate-45 origin-left">{d.date.slice(5)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}

      {/* Recent users */}
      <section>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">Recent Signups</p>
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-slate-400 text-xs">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Joined</th>
            </tr></thead>
            <tbody>
              {data.recentUsers.map(u => (
                <tr key={u._id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white">{u.name}</td>
                  <td className="px-4 py-3 text-slate-400">{u.email}</td>
                  <td className="px-4 py-3">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* USERS TAB                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */
function UsersTab({ showToast, setConfirm }) {
  const [users, setUsers]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page,  setPage]    = useState(1)
  const [search, setSearch] = useState('')
  const [role,   setRole]   = useState('')
  const [loading, setLoading] = useState(false)
  const [acting,  setActing]  = useState(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/admin/users', { params: { search, role, page, limit: 20 } })
      setUsers(r.data.users)
      setTotal(r.data.total)
    } catch { showToast('Failed to load users', 'error') }
    finally { setLoading(false) }
  }, [search, role, page])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const toggleBlock = (u) => {
    const action = u.blocked ? 'unblock' : 'block'
    setConfirm({
      title:    `${action === 'block' ? 'Block' : 'Unblock'} ${u.name}?`,
      message:  action === 'block'
        ? 'Blocked users cannot access the platform until manually unblocked.'
        : 'This will restore full platform access for this user.',
      danger:      action === 'block',
      // Fix 5: require typed confirmation only for the destructive block action
      requireWord: action === 'block' ? 'CONFIRM' : null,
      onConfirm: async () => {
        setActing(u._id)
        try {
          await api.post(`/api/admin/users/${u._id}/${action}`)
          showToast(`User ${action}ed successfully`)
          fetchUsers()
        } catch (e) { showToast(e.response?.data?.message || `Failed to ${action}`, 'error') }
        finally { setActing(null) }
      }
    })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">User Management</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="flex-1 min-w-48 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-200 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
          placeholder="Search by name or email..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
        />
        <select
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500"
          value={role}
          onChange={e => { setRole(e.target.value); setPage(1) }}
        >
          <option value="">All Roles</option>
          <option value="mentor">Mentor</option>
          <option value="mentee">Mentee</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <p className="text-xs text-slate-500">{total} user(s) found</p>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading ? <Skeleton /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-slate-400 text-xs">
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Email</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Joined</th>
              <th className="text-left px-4 py-3">Action</th>
            </tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3">{roleBadge(u.role)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${u.blocked ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'}`}>
                      {u.blocked ? 'Blocked' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {u.role !== 'admin' && (
                      <button
                        disabled={acting === u._id}
                        onClick={() => toggleBlock(u)}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-40 ${
                          u.blocked
                            ? 'bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600/50 border border-emerald-600/30'
                            : 'bg-red-600/30 text-red-300 hover:bg-red-600/50 border border-red-600/30'
                        }`}
                      >
                        {u.blocked ? 'Unblock' : 'Block'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / 20)} setPage={setPage} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* TRANSACTIONS TAB                                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */
function TransactionsTab({ showToast }) {
  const [txns,    setTxns]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [reason,  setReason]  = useState('')
  const [status,  setStatus]  = useState('')
  const [loading, setLoading] = useState(false)

  const fetchTxns = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/admin/transactions', { params: { reason, status, page, limit: 30 } })
      setTxns(r.data.transactions)
      setTotal(r.data.total)
    } catch { showToast('Failed to load transactions', 'error') }
    finally { setLoading(false) }
  }, [reason, status, page])

  useEffect(() => { fetchTxns() }, [fetchTxns])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Transactions</h1>

      <div className="flex flex-wrap gap-3">
        <select
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-200 text-sm focus:outline-none"
          value={reason} onChange={e => { setReason(e.target.value); setPage(1) }}
        >
          <option value="">All Reasons</option>
          <option value="recharge">Recharge</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="signup_bonus">Signup Bonus</option>
          <option value="task_reward">Task Reward</option>
          <option value="course_reward">Course Reward</option>
          <option value="mentor_earning">Mentor Earning</option>
          <option value="course_purchase">Course Purchase</option>
        </select>
        <select
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-200 text-sm focus:outline-none"
          value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="processing">Processing</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <p className="text-xs text-slate-500">{total} transaction(s)</p>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading ? <Skeleton /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-slate-400 text-xs">
              <th className="text-left px-4 py-3">User</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Reason</th>
              <th className="text-right px-4 py-3">Amount</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Date</th>
            </tr></thead>
            <tbody>
              {txns.map(t => (
                <tr key={t._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white text-xs font-medium">{t.userId?.name ?? '—'}</p>
                    <p className="text-slate-500 text-[10px]">{t.userId?.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${t.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {t.type === 'credit' ? '▲' : '▼'} {t.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{t.reason}</td>
                  <td className="px-4 py-3 text-right font-mono text-white">{pts(t.amount)}</td>
                  <td className="px-4 py-3">{badge(t.status)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(t.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / 30)} setPage={setPage} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* WITHDRAWALS TAB                                                             */
/* ═══════════════════════════════════════════════════════════════════════════ */
function WithdrawalsTab({ showToast, setConfirm }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(false)
  const [acting,  setActing]  = useState(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/admin/withdrawals')
      setItems(r.data.withdrawals)
    } catch { showToast('Failed to load withdrawals', 'error') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetch_() }, [fetch_])

  const act = (item, action) => {
    setConfirm({
      title:    `${action === 'approve' ? 'Approve' : 'Reject'} withdrawal?`,
      message:  action === 'approve'
        ? `Trigger Razorpay UPI payout of ₹${(item.amount / 100).toFixed(2)} to ${item.userId?.upiId ?? 'mentor UPI'}. Funds are currently locked in escrow and will be released to the mentor.`
        : `Reject and refund ₹${(item.amount / 100).toFixed(2)} back to the mentor's wallet. The locked funds will be released immediately.`,
      danger:      true,
      // Fix 5: both approve and reject are financial — require explicit CONFIRM
      requireWord: 'CONFIRM',
      onConfirm: async () => {
        setActing(item._id)
        try {
          await api.post(`/api/admin/withdrawals/${item._id}/${action}`)
          showToast(`Withdrawal ${action}d successfully`)
          fetch_()
        } catch (e) { showToast(e.response?.data?.message || 'Action failed', 'error') }
        finally { setActing(null) }
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Withdrawal Control</h1>
        <button onClick={fetch_} className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-slate-300 text-xs hover:bg-white/10 transition-colors">
          ↻ Refresh
        </button>
      </div>

      {loading && <Skeleton />}
      {!loading && items.length === 0 && (
        <div className="text-center py-16 text-slate-500">✅ No pending withdrawals</div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map(w => (
            <div key={w._id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-wrap gap-4 items-center justify-between">
              <div className="space-y-1">
                <p className="text-white font-medium">{w.userId?.name ?? '—'}</p>
                <p className="text-slate-400 text-xs">{w.userId?.email}</p>
                <p className="text-slate-500 text-xs">UPI: {w.userId?.upiId ?? 'N/A'} · Ph: {w.userId?.phone ?? 'N/A'}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-white font-bold text-lg">{pts(w.amount)}</p>
                <p className="text-slate-400 text-xs">{new Date(w.createdAt).toLocaleString()}</p>
                {badge(w.status)}
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  disabled={acting === w._id || w.status === 'completed'}
                  onClick={() => act(w, 'approve')}
                  className="px-4 py-2 bg-emerald-600/30 text-emerald-300 border border-emerald-600/30 rounded-xl text-xs font-medium hover:bg-emerald-600/50 disabled:opacity-40 transition-colors"
                >
                  ✓ Approve
                </button>
                <button
                  disabled={acting === w._id || ['completed','failed'].includes(w.status)}
                  onClick={() => act(w, 'reject')}
                  className="px-4 py-2 bg-red-600/30 text-red-300 border border-red-600/30 rounded-xl text-xs font-medium hover:bg-red-600/50 disabled:opacity-40 transition-colors"
                >
                  ✕ Reject & Refund
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* COURSES TAB                                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */
function CoursesTab({ showToast }) {
  const [courses, setCourses] = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/api/admin/courses', { params: { page, limit: 30 } })
      .then(r => { setCourses(r.data.courses); setTotal(r.data.total) })
      .catch(() => showToast('Failed to load courses', 'error'))
      .finally(() => setLoading(false))
  }, [page])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Courses <span className="text-slate-500 text-lg font-normal">({total})</span></h1>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading ? <Skeleton /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-slate-400 text-xs">
              <th className="text-left px-4 py-3">Title</th>
              <th className="text-left px-4 py-3">Domain</th>
              <th className="text-left px-4 py-3">Mentor</th>
              <th className="text-left px-4 py-3">Mentee</th>
              <th className="text-left px-4 py-3">Progress</th>
              <th className="text-left px-4 py-3">Created</th>
            </tr></thead>
            <tbody>
              {courses.map(c => (
                <tr key={c._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 text-white max-w-[160px] truncate">{c.title ?? c.domain ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{c.domain ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{c.mentor?.name ?? 'None'}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{c.mentee?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-700 rounded-full h-1.5">
                        <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${c.progress ?? 0}%` }} />
                      </div>
                      <span className="text-slate-400 text-xs">{c.progress ?? 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / 30)} setPage={setPage} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* AUDIT LOG TAB                                                               */
/* ═══════════════════════════════════════════════════════════════════════════ */
function AuditTab({ showToast }) {
  const [logs,    setLogs]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [page,    setPage]    = useState(1)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get('/api/admin/audit-logs', { params: { page, limit: 50 } })
      .then(r => { setLogs(r.data.logs); setTotal(r.data.total) })
      .catch(() => showToast('Failed to load audit logs', 'error'))
      .finally(() => setLoading(false))
  }, [page])

  const actionColor = (action) => {
    if (action.includes('block'))   return 'text-red-400'
    if (action.includes('reject'))  return 'text-rose-400'
    if (action.includes('approve')) return 'text-emerald-400'
    return 'text-slate-300'
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Audit Log <span className="text-slate-500 text-lg font-normal">({total})</span></h1>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        {loading ? <Skeleton /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-slate-400 text-xs">
              <th className="text-left px-4 py-3">Admin</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Target</th>
              <th className="text-left px-4 py-3">Metadata</th>
              <th className="text-left px-4 py-3">Time</th>
            </tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l._id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white text-xs">{l.actorId?.name ?? '—'}</p>
                    <p className="text-slate-500 text-[10px]">{l.actorId?.email}</p>
                  </td>
                  <td className={`px-4 py-3 text-xs font-mono font-medium ${actionColor(l.action)}`}>{l.action}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{l.targetRef || String(l.targetId ?? '—').slice(-8)}</td>
                  <td className="px-4 py-3 text-slate-500 text-[10px] font-mono max-w-[180px] truncate">
                    {JSON.stringify(l.metadata ?? {})}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pages={Math.ceil(total / 50)} setPage={setPage} />
    </div>
  )
}

/* ─── shared ──────────────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="space-y-3 p-6">
      {[1,2,3,4].map(i => (
        <div key={i} className="h-8 bg-white/5 rounded-xl animate-pulse" />
      ))}
    </div>
  )
}

function Pagination({ page, pages, setPage }) {
  if (pages <= 1) return null
  return (
    <div className="flex justify-center gap-2 pt-2">
      <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-30 hover:bg-white/10 transition-colors">
        ← Prev
      </button>
      <span className="px-3 py-1.5 text-xs text-slate-400">Page {page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
        className="px-3 py-1.5 text-xs rounded-lg bg-white/5 border border-white/10 text-slate-300 disabled:opacity-30 hover:bg-white/10 transition-colors">
        Next →
      </button>
    </div>
  )
}
