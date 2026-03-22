// frontend/src/pages/mentor/Profile.jsx
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

export default function Profile() {
  const { user: authUser } = useAuth()
  const navigate = useNavigate()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    name: '',
    email: '',
    profilePhoto: '',
    resumeUrl: '',
    expertise: []
  })
  const [expertiseInput, setExpertiseInput] = useState('')
  const [profilePhotoFile, setProfilePhotoFile] = useState(null)
  const [resumeFile, setResumeFile] = useState(null)

  useEffect(() => {
    fetchProfile()
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await api.get('/api/profile/me')
      const user = res.data.user
      setProfile({
        name: user.name || '',
        email: user.email || '',
        profilePhoto: user.profilePhoto || '',
        resumeUrl: user.resumeUrl || user.resumeURL || '',
        expertise: user.expertise || []
      })
      setExpertiseInput((user.expertise || []).join(', '))
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
      
      if (expertiseInput.trim()) {
        formData.append('expertise', expertiseInput)
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
      
      // Update local state
      if (res.data.user) {
        setProfile(prev => ({
          ...prev,
          name: res.data.user.name,
          email: res.data.user.email,
          profilePhoto: res.data.user.profilePhoto || prev.profilePhoto,
          resumeUrl: res.data.user.resumeUrl || prev.resumeUrl,
          expertise: res.data.user.expertise || []
        }))
        setExpertiseInput((res.data.user.expertise || []).join(', '))
      }

      // Clear file inputs
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
          <AppSidebar userRole="mentor" />
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
        <AppSidebar userRole="mentor" />
        <main className="flex-1 p-6 max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <button
              onClick={() => navigate('/mentor')}
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
                  <p className="text-slate-400 text-sm">Mentor</p>
                  {profile.expertise.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.expertise.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-indigo-600/30 text-indigo-300 rounded-full text-xs"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
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

                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Expertise</label>
                  <input
                    type="text"
                    value={expertiseInput}
                    onChange={(e) => setExpertiseInput(e.target.value)}
                    placeholder="e.g., React, Node.js, MongoDB (comma separated)"
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Enter your expertise/skills separated by commas. These will be used for mentee matching.
                  </p>
                  {profile.expertise.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {profile.expertise.map((skill, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-indigo-600/30 text-indigo-300 rounded-full text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

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

                <div className="flex justify-end gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => navigate('/mentor')}
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

