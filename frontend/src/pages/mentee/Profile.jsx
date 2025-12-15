// frontend/src/pages/mentee/Profile.jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Card from '../../components/Card'
import ToastContainer, { showToast } from '../../components/Toast'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'

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
    interests: []
  })
  const [interestsInput, setInterestsInput] = useState('')
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
      
      // Update local state
      if (res.data.user) {
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
        <main className="max-w-4xl mx-auto p-6">
          <div className="text-center py-8">Loading profile...</div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Header />
      <ToastContainer />
      <main className="max-w-4xl mx-auto p-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-4 px-4 py-2 rounded bg-gray-200 hover:bg-gray-300"
        >
          ← Back to Dashboard
        </button>
        <h2 className="text-2xl font-semibold mb-6">My Profile</h2>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Photo */}
            <div>
              <label className="block text-sm font-medium mb-2">Profile Photo</label>
              {profile.profilePhoto && (
                <div className="mb-2">
                  <img 
                    src={profile.profilePhoto} 
                    alt="Profile" 
                    className="w-24 h-24 object-cover rounded-full"
                  />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setProfilePhotoFile(e.target.files[0])}
                className="w-full p-2 border rounded-lg"
              />
              {profilePhotoFile && (
                <p className="text-sm text-gray-600 mt-1">New photo selected: {profilePhotoFile.name}</p>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">Name</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Interests */}
            <div>
              <label className="block text-sm font-medium mb-2">Interests</label>
              <input
                type="text"
                value={interestsInput}
                onChange={(e) => setInterestsInput(e.target.value)}
                placeholder="e.g., React, Node.js, MongoDB (comma separated)"
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter your interests/skills separated by commas. These will be used for mentor matching.
              </p>
              {profile.interests.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {profile.interests.map((interest, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      {interest}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Resume Upload */}
            <div>
              <label className="block text-sm font-medium mb-2">Resume (Optional)</label>
              {profile.resumeUrl && (
                <div className="mb-2">
                  <a 
                    href={profile.resumeUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline text-sm"
                  >
                    View current resume
                  </a>
                </div>
              )}
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setResumeFile(e.target.files[0])}
                className="w-full p-2 border rounded-lg"
              />
              {resumeFile && (
                <p className="text-sm text-gray-600 mt-1">New resume selected: {resumeFile.name}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Upload a new resume to update your keywords automatically.
              </p>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => navigate('/mentee')}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Card>
      </main>
      <Footer />
    </>
  )
}

