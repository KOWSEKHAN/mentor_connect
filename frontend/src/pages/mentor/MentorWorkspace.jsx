import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../utils/auth'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import ChatBox from '../mentee/workspace/ChatBox'
import AIContentView from '../mentee/workspace/AIContentView'
import TasksView from '../mentee/workspace/TasksView'
import Sidebar from '../mentee/workspace/Sidebar'
import OverviewView from '../mentee/workspace/OverviewView'
import Certificate from '../mentee/workspace/Certificate'
import MentorNotesView from './MentorNotesView'
import { RoadmapView, StepDetailsPanel } from '../../components/roadmap'
import api from '../../utils/api'
import { showToast } from '../../components/Toast'
import { motion } from 'framer-motion'
import useMentorshipRealtime from '../../hooks/useMentorshipRealtime'

export default function MentorWorkspace () {
  const { mentorshipId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStep, setSelectedStep] = useState(null)
  const fetchSeq = useRef(0)

  const fetchWorkspace = async () => {
    if (!mentorshipId) return
    const seq = ++fetchSeq.current
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/mentor/mentorship/${mentorshipId}`)
      if (seq !== fetchSeq.current) return
      setWorkspace(res.data || null)
    } catch (err) {
      console.error(err)
      const msg = err.response?.data?.message || 'Failed to load mentee workspace'
      if (seq !== fetchSeq.current) return
      setError(msg)
      showToast(msg, 'error')
    } finally {
      if (seq === fetchSeq.current) setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkspace()
  }, [mentorshipId])

  const mentee = workspace?.mentee
  const course = workspace?.course || { mentee: workspace?.mentee, mentor: user, notes: workspace?.notes || '' }
  const courseId = course?._id || workspace?.courseId
  const chatMentorshipId = workspace?._id || workspace?.mentorship?._id || workspace?.mentorshipId || mentorshipId
  const currentLevel = workspace?.currentLevel || workspace?.mentorship?.currentLevel || 'beginner'
  const notes = workspace?.notes || course?.notes || 'No notes available yet.'
  const realtime = useMentorshipRealtime(courseId)

  useEffect(() => {
    if (!realtime?.progressUpdated) return
    if (String(realtime.progressUpdated.courseId || '') !== String(courseId || '')) return
    setWorkspace((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        progress: Number(realtime.progressUpdated.overallProgress ?? prev.progress ?? 0),
        mentorship: prev.mentorship
          ? {
              ...prev.mentorship,
              progress: Number(realtime.progressUpdated.overallProgress ?? prev.mentorship.progress ?? 0),
            }
          : prev.mentorship,
      }
    })
  }, [realtime?.progressUpdated, courseId])

  useEffect(() => {
    if (!realtime?.levelUpdated) return
    if (String(realtime.levelUpdated.courseId || '') !== String(courseId || '')) return
    setWorkspace((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        currentLevel: realtime.levelUpdated.currentLevel,
        mentorship: prev.mentorship
          ? {
              ...prev.mentorship,
              currentLevel: realtime.levelUpdated.currentLevel,
            }
          : prev.mentorship,
      }
    })
  }, [realtime?.levelUpdated, courseId])

  return (
    <>
      <Header />
      <div className="h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex flex-col overflow-hidden">
        <main className="w-full flex-1 min-h-0 px-6 py-4 flex flex-col overflow-hidden">
          {loading ? (
            <div className="w-full flex-1 flex items-center justify-center p-4">
              <div className="text-slate-400">Loading workspace...</div>
            </div>
          ) : error ? (
            <div className="w-full flex-1 flex flex-col items-center justify-center p-4 text-slate-400">
              <p>{error}</p>
              <button
                onClick={() => navigate('/mentor')}
                className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700"
              >
                Back to Dashboard
              </button>
            </div>
          ) : !mentee ? (
            <div className="w-full flex-1 flex items-center justify-center p-4">
              <div className="text-slate-400">Mentee not found</div>
            </div>
          ) : (
            <>
              <div className="w-full flex-shrink-0 mb-4">
                <button
                  type="button"
                  onClick={() => navigate('/mentor')}
                  className="text-indigo-400 hover:text-indigo-300 mb-2 transition-all duration-200"
                >
                  ← Back to Dashboard
                </button>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">{course?.title || workspace?.domain || 'Mentorship Workspace'}</h2>
                    <p className="text-slate-400">
                      {(course?.domain || workspace?.domain || 'General')} • Mentee: {mentee?.name || 'Unknown'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase tracking-wide text-slate-500">Role</p>
                    <p className="text-xl font-semibold text-indigo-300">Mentor</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 min-h-0 overflow-hidden gap-6 w-full">
                <div className="w-64 flex-shrink-0 h-full min-h-0">
                  <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} chatLabel="Chat with Mentee" />
                </div>

                <div className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0 w-full h-full">
                  <div className="w-full h-full flex flex-col min-h-0 rounded-xl border border-slate-700 bg-slate-900/40 overflow-hidden">
                    <div className="flex-1 overflow-hidden">
                      <div className="h-full overflow-y-auto p-4 md:p-6">
                        <motion.div
                          key={activeTab}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2 }}
                          className="h-full"
                        >
                          {activeTab === 'overview' && <OverviewView course={{ ...course, currentLevel: currentLevel, progress: workspace?.progress ?? course?.progress ?? 0 }} />}
                          {activeTab === 'ai-content' && (
                            <AIContentView
                              mentorshipId={chatMentorshipId}
                              level={selectedStep?.level || currentLevel}
                              userRole="mentor"
                              courseId={courseId}
                              realtimeContentEvent={realtime?.aiContentPublished}
                              realtimeSnapshot={realtime?.snapshot}
                            />
                          )}
                          {activeTab === 'roadmap' && (
                            <div className="w-full space-y-6">
                              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                                <RoadmapView
                                  courseId={courseId}
                                  userRole="mentor"
                                  course={{ ...course, mentee: mentee, mentorshipId: chatMentorshipId, currentLevel }}
                                  onStepSelect={setSelectedStep}
                                  realtimeRoadmapEvent={realtime?.roadmapCreated}
                                />
                                <StepDetailsPanel step={selectedStep} courseId={courseId} />
                              </div>
                            </div>
                          )}
                          {activeTab === 'tasks' && (
                            <TasksView
                              mentorshipId={chatMentorshipId}
                              level={selectedStep?.level || currentLevel}
                              userRole="mentor"
                              courseId={courseId}
                              realtimeTaskCreatedEvent={realtime?.taskCreated}
                              realtimeTaskCompletedEvent={realtime?.taskCompleted}
                              realtimeSnapshot={realtime?.snapshot}
                            />
                          )}
                          {activeTab === 'notes' && <MentorNotesView notes={notes} />}
                          {activeTab === 'certificate' && (
                            <Certificate
                              course={{ ...course, currentLevel, progress: workspace?.progress ?? course?.progress ?? 0 }}
                              courseId={courseId}
                              user={mentee}
                            />
                          )}
                          {activeTab === 'chat' && (
                            <div className="w-full h-full flex flex-col">
                              <ChatBox
                                course={{ ...course, mentee }}
                                mentorshipId={chatMentorshipId}
                                userId={user._id || user.id}
                                userName={user.name}
                              />
                            </div>
                          )}
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
      <Footer />
    </>
  )
}
