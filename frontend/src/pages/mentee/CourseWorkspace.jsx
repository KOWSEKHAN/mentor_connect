import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../utils/auth'
import api from '../../utils/api'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Sidebar from './workspace/Sidebar'
import ChatBox from './workspace/ChatBox'
import { RoadmapView, StepDetailsPanel } from '../../components/roadmap'
import AIContentView from './workspace/AIContentView'
import OverviewView from './workspace/OverviewView'
import TasksView from './workspace/TasksView'
import NotesView from './workspace/NotesView'
import Certificate from './workspace/Certificate'

export default function CourseWorkspace() {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const { user, updateUser } = useAuth()
  const [course, setCourse] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [selectedStep, setSelectedStep] = useState(null)
  const fetchSeq = useRef(0)

  useEffect(() => {
    fetchCourse()
  }, [courseId])

  const fetchCourse = async () => {
    const seq = ++fetchSeq.current
    setLoading(true)
    setCourse(null)
    try {
      const res = await api.get(`/api/courses/${courseId}`)
      if (seq !== fetchSeq.current) return
      setCourse(res.data.course)
    } catch (err) {
      console.error('Failed to fetch course:', err)
      if (seq !== fetchSeq.current) return
      navigate('/mentee')
    } finally {
      if (seq === fetchSeq.current) setLoading(false)
    }
  }

  const updateCourse = async (updates) => {
    try {
      const res = await api.patch(`/api/courses/${courseId}`, updates)
      setCourse(res.data.course)
      try {
        const me = await api.get('/api/auth/me')
        if (me.data?.user?.points != null) updateUser?.({ points: me.data.user.points })
      } catch {
        /* ignore */
      }
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
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
          <main className="w-full min-h-screen px-6 py-4 flex flex-col">
            <div className="w-full flex-1 flex items-center justify-center p-4">
              <div className="text-slate-400">Loading course...</div>
            </div>
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
        <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
          <main className="w-full min-h-screen px-6 py-4 flex flex-col">
            <div className="w-full flex-1 flex items-center justify-center p-4">
              <div className="text-slate-400">Course not found</div>
            </div>
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
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <main className="w-full min-h-screen px-6 py-4 flex flex-col">
          <div className="w-full flex-shrink-0 mb-4">
            <button
              type="button"
              onClick={() => navigate('/mentee')}
              className="text-indigo-400 hover:text-indigo-300 mb-2 transition-all duration-200"
            >
              ← Back to Dashboard
            </button>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-white">{course.title}</h2>
                <p className="text-slate-400">{course.domain} • Mentor: {mentorName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-500">Points</p>
                <p className="text-xl font-semibold text-amber-300 tabular-nums">{user?.points ?? 0}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 gap-6 w-full h-[calc(100vh-220px)]">
            <div className="w-64 flex-shrink-0 h-full min-h-0">
              <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>

            <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full h-full">
              <div className="w-full h-full flex flex-col min-h-0 rounded-xl border border-slate-700 bg-slate-900/40 overflow-hidden">
                <div className="w-full flex-1 min-h-0 p-4 md:p-6 overflow-auto">
                  {activeTab === 'overview' && (
                    <OverviewView course={course} />
                  )}
                  {activeTab === 'ai-content' && (
                    <AIContentView
                      course={course}
                      updateCourse={updateCourse}
                      courseId={courseId}
                      refreshCourse={refreshCourse}
                    />
                  )}
                  {activeTab === 'roadmap' && (
                    <div className="w-full space-y-6">
                      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                        <RoadmapView
                          courseId={courseId}
                          userRole="mentee"
                          course={course}
                          onStepSelect={setSelectedStep}
                        />
                        <StepDetailsPanel step={selectedStep} courseId={courseId} />
                      </div>
                    </div>
                  )}
                  {activeTab === 'tasks' && (
                    <TasksView
                      course={course}
                      updateCourse={updateCourse}
                      refreshCourse={refreshCourse}
                    />
                  )}
                  {activeTab === 'notes' && (
                    <NotesView
                      course={course}
                      updateCourse={updateCourse}
                      refreshCourse={refreshCourse}
                    />
                  )}
                  {activeTab === 'certificate' && (
                    <Certificate course={course} courseId={courseId} user={user} />
                  )}
                  {activeTab === 'chat' && (
                    <div className="w-full h-full min-h-[480px] flex flex-col">
                      <ChatBox
                        course={course}
                        mentorshipId={course?.mentorshipId}
                        userId={user._id || user.id}
                        userName={user.name}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </>
  )
}
