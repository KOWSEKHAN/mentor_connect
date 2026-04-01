import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../utils/auth'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Card from '../../components/Card'
import ChatBox from '../mentee/workspace/ChatBox'
import AIContentView from '../mentee/workspace/AIContentView'
import TasksPanel from '../mentee/workspace/TasksPanel'
import { RoadmapView, StepDetailsPanel } from '../../components/roadmap'
import api from '../../utils/api'
import { showToast } from '../../components/Toast'

export default function MentorWorkspace () {
  const { mentorshipId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
  const course = workspace?.course || { mentee: workspace?.mentee, mentor: user }
  const courseId = course?._id || workspace?.courseId
  const chatMentorshipId = workspace?._id || workspace?.mentorship?._id || workspace?.mentorshipId || mentorshipId
  const currentLevel = workspace?.currentLevel || workspace?.mentorship?.currentLevel || course?.currentLevel || 'beginner'
  const notes = workspace?.notes || course?.notes || 'No notes available yet.'
  const progress = workspace?.progress ?? course?.progress ?? 0
  const [selectedStep, setSelectedStep] = useState(null)

  const updateCourse = async (updates) => {
    if (!courseId) return false
    try {
      const res = await api.patch(`/api/courses/${courseId}`, updates)
      if (res.data?.course) setWorkspace((w) => ({ ...w, course: res.data.course }))
      return true
    } catch {
      return false
    }
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className='text-center py-16 text-slate-400'>
          Loading workspace...
        </div>
      )
    }

    if (error) {
      return (
        <div className='text-center py-16 text-slate-400'>
          <p>{error}</p>
          <button
            onClick={() => navigate('/mentor')}
            className='mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700'
          >
            Back to Dashboard
          </button>
        </div>
      )
    }

    if (!mentee) {
      return (
        <div className='text-center py-16 text-slate-400'>
          <p>Loading mentee...</p>
        </div>
      )
    }

    return (
      <>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <p className='text-sm text-slate-400'>Mentor Workspace</p>
            <h2 className='text-2xl font-semibold text-slate-100'>{mentee.name}</h2>
            <p className='text-slate-400'>
              {course?.title || course?.domain || workspace?.domain || 'General learning track'}
            </p>
          </div>
          <button
            onClick={() => navigate('/mentor')}
            className='px-4 py-2 border border-slate-600 rounded-xl text-slate-300 hover:bg-white/5 text-sm'
          >
            ← Back
          </button>
        </div>

        <div className='flex flex-col space-y-6'>
          {courseId && (
            <>
              <RoadmapView
                courseId={courseId}
                userRole="mentor"
                course={course}
                onStepSelect={setSelectedStep}
              />
              <StepDetailsPanel step={selectedStep} courseId={courseId} />
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-white mb-3">AI Content</h3>
                <div className="min-h-[200px] text-slate-400">
                  <AIContentView
                    mentorshipId={chatMentorshipId}
                    level={selectedStep?.level || currentLevel}
                    userRole="mentor"
                  />
                </div>
              </div>
              <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
                <h3 className="text-lg font-semibold text-white mb-3">Tasks</h3>
                <div className="min-h-[180px] text-slate-400">
                  <TasksPanel
                    roadmapStepId={selectedStep?.level || currentLevel}
                    course={{ ...course, mentorshipId: chatMentorshipId, currentLevel }}
                    userRole="mentor"
                  />
                </div>
              </div>
            </>
          )}
          <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
            <div className="h-96 p-4">
              <ChatBox
                course={course}
                mentorshipId={chatMentorshipId}
                userId={user._id || user.id}
                userName={user.name}
              />
            </div>
          </div>

          <div className='grid md:grid-cols-2 gap-6'>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
              <h3 className='text-lg font-semibold mb-4 text-white'>Course Progress</h3>
              <p className='text-sm text-slate-400 mb-2'>
                Current progress: {progress}%{workspace?.status === 'completed' ? ' (Completed)' : ''}
              </p>
              <p className='text-sm text-slate-400 mb-2'>
                Current level: <span className="capitalize text-indigo-300">{currentLevel}</span>
              </p>
              <div className='w-full bg-slate-700 rounded-full h-3'>
                <div
                  className='bg-indigo-600 h-3 rounded-full transition-all'
                  style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
                />
              </div>
              {course?.domain && (
                <p className='text-sm text-slate-400 mt-3'>
                  Domain: {course.domain}
                </p>
              )}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
              <h3 className='text-lg font-semibold mb-3 text-white'>Mentee Notes</h3>
              <div className='bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-400 whitespace-pre-line min-h-[120px]'>
                {notes}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <main className='w-full min-h-screen px-6 py-4'>
          {renderContent()}
        </main>
      </div>
      <Footer />
    </>
  )
}
