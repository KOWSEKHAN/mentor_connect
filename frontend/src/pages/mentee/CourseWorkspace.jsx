import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Sidebar from './workspace/Sidebar'
import ContentView from './workspace/ContentView'
import ChatBox from './workspace/ChatBox'
import { RoadmapView, StepDetailsPanel } from '../../components/roadmap'
import AIContentView from './workspace/AIContentView'
import TasksPanel from './workspace/TasksPanel'

export default function CourseWorkspace() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [course, setCourse] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [selectedStep, setSelectedStep] = useState(null)

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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
          <main className="max-w-7xl mx-auto p-6">
            <div className="text-center py-12 text-slate-400">Loading course...</div>
          </main>
        </div>
        <Footer />
      </>
    )
  }

  if (!course) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
          <main className="max-w-7xl mx-auto p-6">
            <div className="text-center py-12 text-slate-400">Course not found</div>
          </main>
        </div>
        <Footer />
      </>
    )
  }

  const mentorName = course?.mentor?.name || 'No mentor assigned yet'

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <main className="max-w-7xl mx-auto p-6">
          <div className="mb-6">
            <button
              onClick={() => navigate('/mentee')}
              className="text-indigo-400 hover:text-indigo-300 mb-2 transition-all duration-200"
            >
              ← Back to Dashboard
            </button>
            <h2 className="text-2xl font-semibold text-white">{course.title}</h2>
            <p className="text-slate-400">{course.domain} • Mentor: {mentorName}</p>
          </div>

        <div className="flex gap-6 h-[calc(100vh-250px)]">
          {/* Sidebar */}
          <div className="w-64 flex-shrink-0">
            <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
          </div>

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-h-0 space-y-6">
            {activeTab === 'roadmap' ? (
              <div className="flex flex-col h-full gap-6 overflow-auto">
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                <RoadmapView
                  courseId={courseId}
                  userRole="mentee"
                  course={course}
                  onStepSelect={setSelectedStep}
                />
                <StepDetailsPanel step={selectedStep} courseId={courseId} />
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg min-h-[200px]">
                  <AIContentView
                    roadmapStepId={selectedStep?.stepId || selectedStep?._id}
                    courseId={courseId}
                    course={course}
                    updateCourse={updateCourse}
                    refreshCourse={refreshCourse}
                  />
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg min-h-[180px]">
                  <TasksPanel
                    roadmapStepId={selectedStep?.stepId || selectedStep?._id}
                    course={course}
                    updateCourse={updateCourse}
                    refreshCourse={refreshCourse}
                  />
                </div>
                <div className="h-80 flex-shrink-0 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                  <ChatBox
                    course={course}
                    mentorshipId={course?.mentorshipId}
                    userId={user._id || user.id}
                    userName={user.name}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-auto">
                  <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                  <ContentView
                    activeTab={activeTab}
                    course={course}
                    updateCourse={updateCourse}
                    courseId={courseId}
                    refreshCourse={refreshCourse}
                  />
                  </div>
                </div>
                <div className="h-80 flex-shrink-0 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                  <ChatBox
                    course={course}
                    mentorshipId={course?.mentorshipId}
                    userId={user._id || user.id}
                    userName={user.name}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      </div>
      <Footer />
    </>
  )
}

