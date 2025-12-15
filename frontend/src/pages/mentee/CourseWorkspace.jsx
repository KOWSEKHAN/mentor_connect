import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Sidebar from './workspace/Sidebar'
import ContentView from './workspace/ContentView'
import ChatBox from './workspace/ChatBox'

export default function CourseWorkspace() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [course, setCourse] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCourse()
  }, [courseId])

  const fetchCourse = async () => {
    try {
      const res = await api.get(`/api/courses/${courseId}`)
      setCourse(res.data.course)
    } catch (err) {
      console.error('Failed to fetch course:', err)
      navigate('/mentee')
    } finally {
      setLoading(false)
    }
  }

  const updateCourse = async (updates) => {
    try {
      const res = await api.patch(`/api/courses/${courseId}`, updates)
      setCourse(res.data.course)
      return true
    } catch (err) {
      console.error('Failed to update course:', err)
      return false
    }
  }

  const refreshCourse = () => {
    fetchCourse()
  }

  if (loading) {
    return (
      <>
        <Header />
        <main className="max-w-7xl mx-auto p-6">
          <div className="text-center py-12">Loading course...</div>
        </main>
        <Footer />
      </>
    )
  }

  if (!course) {
    return (
      <>
        <Header />
        <main className="max-w-7xl mx-auto p-6">
          <div className="text-center py-12">Course not found</div>
        </main>
        <Footer />
      </>
    )
  }

  const mentorName = course?.mentor?.name || 'No mentor assigned yet'

  return (
    <>
      <Header />
      <main className="max-w-7xl mx-auto p-6">
        <div className="mb-4">
          <button
            onClick={() => navigate('/mentee')}
            className="text-blue-600 hover:text-blue-800 mb-2"
          >
            ← Back to Dashboard
          </button>
          <h2 className="text-2xl font-semibold">{course.title}</h2>
          <p className="text-gray-600">{course.domain} • Mentor: {mentorName}</p>
        </div>

        <div className="flex gap-6 h-[calc(100vh-250px)]">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 overflow-auto mb-4">
              <ContentView
                activeTab={activeTab}
                course={course}
                updateCourse={updateCourse}
                courseId={courseId}
                refreshCourse={refreshCourse}
              />
            </div>

            {/* Chat Window - Pinned Bottom */}
            <div className="h-80 flex-shrink-0">
              <ChatBox
                course={course}
                userId={user._id || user.id}
                userName={user.name}
              />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

