// frontend/src/pages/mentee/Profile.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import AppSidebar from '../../components/AppSidebar'
import Card from '../../components/Card'
import ToastContainer, { showToast } from '../../components/Toast'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'
import { motion } from 'framer-motion'
import Skeleton from '../../components/ui/Skeleton'

const TX_LABEL = {
  signup: 'Signup',
  course_completion: 'Course completion',
  task_completion: 'Task completion',
  mentor_reward: 'Mentor reward',
  spend: 'Spend',
}

export default function Profile() {
  const { user: authUser, updateUser } = useAuth()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    profilePhoto: '',
    resumeUrl: '',
    interests: []
  })
  const [interestsInput, setInterestsInput] = useState('')
  const [profilePhotoFile, setProfilePhotoFile] = useState(null)
  const [resumeFile, setResumeFile] = useState(null)
  const [pointLedger, setPointLedger] = useState({ balance: 0, transactions: [] })
  const [pointsLoading, setPointsLoading] = useState(false)
  const [recharging, setRecharging] = useState(false)

  const fetchPointsLedger = async () => {
    setPointsLoading(true)
    try {
      const [walletRes, txRes] = await Promise.all([
        api.get('/api/wallet/me'),
        api.get('/api/wallet/transactions')
      ])
      const balance = ((walletRes.data?.wallet?.balance ?? 0) / 100).toFixed(2)
      
      const scaledTransactions = (txRes.data?.transactions || []).map(tx => ({
        ...tx,
        amount: (tx.amount / 100).toFixed(2)
      }))

      setPointLedger({ balance, transactions: scaledTransactions })
      updateUser?.({ points: balance })
    } catch (err) {
      console.error('Failed to load points:', err)
    } finally {
      setPointsLoading(false)
    }
  }

  const handleRecharge = async () => {
    const amount = prompt("Enter amount to recharge via UPI:")
    if (!amount || isNaN(amount) || amount <= 0) return
    setRecharging(true)
    try {
      await api.post('/api/wallet/recharge', { amount: Number(amount) })
      showToast('Recharge successful', 'success')
      fetchPointsLedger()
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to recharge', 'error')
    } finally {
      setRecharging(false)
    }
  }

  useEffect(() => {
    if (!authUser) return
    if (authUser.role && authUser.role !== 'mentee') {
      navigate('/mentor', { replace: true })
      return
    }
    setLoading(true)
    setProfile({
      name: '',
      email: '',
      profilePhoto: '',
      resumeUrl: '',
      interests: []
    })
    setInterestsInput('')
    setProfilePhotoFile(null)
    setResumeFile(null)
    fetchProfile()
    fetchPointsLedger()
  }, [authUser?._id, authUser?.id, authUser?.role])

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/profile/me')
      const user = res.data.user
      setProfile({
        name: user.name || '',
        email: user.email || '',
        profilePhoto: user.profilePhoto || '',
        resumeUrl: user.resumeUrl || user.resumeURL || '',
        interests: user.interests || []
      })
      setInterestsInput((user.interests || []).join(', '))
    } catch (err) {
      console.error('Failed to fetch profile:', err)
      showToast('Failed to load profile', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)

    try {
      const formData = new FormData()
      formData.append('name', profile.name)
      formData.append('email', profile.email)
      
      if (interestsInput.trim()) {
        formData.append('interests', interestsInput)
      }

      if (profilePhotoFile) {
        formData.append('profilePhoto', profilePhotoFile)
      }

      if (resumeFile) {
        formData.append('resume', resumeFile)
      }

      const res = await api.put('/api/profile/update', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      showToast('Profile updated successfully!', 'success')
      
      if (res.data.user) {
        updateUser?.({
          name: res.data.user.name,
          email: res.data.user.email,
          role: res.data.user.role,
          _id: res.data.user.id || res.data.user._id
        })
        setProfile(prev => ({
          ...prev,
          name: res.data.user.name,
          email: res.data.user.email,
          profilePhoto: res.data.user.profilePhoto || prev.profilePhoto,
          resumeUrl: res.data.user.resumeUrl || prev.resumeUrl,
          interests: res.data.user.interests || []
        }))
        setInterestsInput((res.data.user.interests || []).join(', '))
      }

      setProfilePhotoFile(null)
      setResumeFile(null)
    } catch (err) {
      console.error('Failed to update profile:', err)
      showToast(err.response?.data?.message || 'Failed to update profile', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
          <AppSidebar userRole="mentee" />
          <main className="flex-1 p-6 max-w-4xl">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-6 space-y-4">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-3/4" />
            </div>
          </main>
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <ToastContainer />
      <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <AppSidebar userRole="mentee" />
        <main className="flex-1 p-6 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <button
              onClick={() => navigate('/mentee')}
              className="mb-4 px-4 py-2 rounded-xl border border-slate-600 text-slate-300 hover:bg-white/5 transition-colors"
            >
              ← Back to Dashboard
            </button>
            <h2 className="text-2xl font-semibold mb-6 text-slate-100">My Profile</h2>

            <Card className="bg-slate-800/80 border-slate-700 text-slate-100">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-6 border-b border-slate-700 mb-6">
                <div className="flex-shrink-0">
                  {profile.profilePhoto ? (
                    <img
                      src={profile.profilePhoto}
                      alt="Profile"
                      className="w-20 h-20 object-cover rounded-full border-2 border-slate-600"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-slate-700 flex items-center justify-center text-2xl text-slate-400 font-semibold">
                      {profile.name?.charAt(0) || '?'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-white">{profile.name || 'No name'}</h3>
                  <p className="text-slate-400 text-sm">Mentee</p>
                  {profile.interests.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.interests.map((interest, idx) => (
                         <span
                          key={idx}
                          className="px-2 py-1 bg-indigo-600/30 text-indigo-300 rounded-full text-xs"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-6 p-4 rounded-xl bg-slate-900/50 border border-slate-700">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">Wallet Balance</p>
                    <p className="text-2xl font-semibold text-amber-300 tabular-nums">
                      {pointsLoading ? '…' : pointLedger.balance} Points
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRecharge}
                      disabled={recharging}
                      className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      {recharging ? 'Processing...' : 'Recharge Wallet'}
                    </button>
                    <button
                      type="button"
                      onClick={() => fetchPointsLedger()}
                      className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                <div className="mt-4 max-h-48 overflow-y-auto border-t border-slate-700 pt-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Recent activity</p>
                  {!pointLedger.transactions.length && !pointsLoading ? (
                    <p className="text-sm text-slate-500">No transactions yet.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {pointLedger.transactions.slice(0, 30).map((tx) => (
                        <li
                          key={tx._id}
                          className="flex justify-between gap-2 text-slate-300"
                        >
                          <span>
                            <span className={`font-medium ${tx.type === 'credit' ? 'text-green-400' : 'text-red-400'}`}>
                              {tx.type === 'credit' ? '+' : '-'}{tx.amount}
                            </span>
                            <span className="text-slate-500 ml-2">
                              {tx.reason.replace(/_/g, ' ')}
                            </span>
                          </span>
                          <span className="text-slate-500 whitespace-nowrap tabular-nums">
                            {tx.createdAt
                              ? new Date(tx.createdAt).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Profile Photo */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Profile Photo</label>
                  {profile.profilePhoto && (
                    <div className="mb-2">
                      <img
                        src={profile.profilePhoto}
                        alt="Profile"
                        className="w-24 h-24 object-cover rounded-full border border-slate-600"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setProfilePhotoFile(e.target.files[0])}
                    className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm"
                  />
                  {profilePhotoFile && (
                    <p className="text-sm text-slate-400 mt-1">New photo selected: {profilePhotoFile.name}</p>
                  )}
                </div>

                {/* Name */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Name</label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Email</label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                {/* Interests */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Interests</label>
                  <input
                    type="text"
                    value={interestsInput}
                    onChange={(e) => setInterestsInput(e.target.value)}
                    placeholder="e.g., React, Node.js, MongoDB (comma separated)"
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your interests/skills separated by commas. These will be used for mentor matching.
                  </p>
                  {profile.interests.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.interests.map((interest, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-indigo-600/30 text-indigo-300 rounded-full text-sm"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Resume Upload */}
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Resume (Optional)</label>
                  {profile.resumeUrl && (
                    <div className="mb-2">
                      <a
                        href={profile.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 text-sm"
                      >
                        View current resume
                      </a>
                    </div>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => setResumeFile(e.target.files[0])}
                    className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-sm"
                  />
                  {resumeFile && (
                    <p className="text-sm text-slate-400 mt-1">New resume selected: {resumeFile.name}</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Upload a new resume to update your keywords automatically.
                  </p>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/mentee')}
                    className="px-4 py-2 border border-slate-600 rounded-xl text-slate-300 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 hover:shadow-indigo-500/20 disabled:opacity-50 transition-all"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </Card>
          </motion.div>
        </main>
      </div>
      <Footer />
    </>
  )
}

