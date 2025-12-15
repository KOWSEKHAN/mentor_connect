import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Card from '../../components/Card'
import MentorChat from './MentorChat'
import api from '../../utils/api'
import { showToast } from '../../components/Toast'

export default function MentorWorkspace () {
  const { menteeId } = useParams()
  const navigate = useNavigate()
  const [workspace, setWorkspace] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchWorkspace = async () => {
    if (!menteeId) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/mentor/mentee/${menteeId}`)
      setWorkspace(res.data || null)
    } catch (err) {
      console.error(err)
      const msg = err.response?.data?.message || 'Failed to load mentee workspace'
      setError(msg)
      showToast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWorkspace()
  }, [menteeId])

  const mentee = workspace?.mentee
  const course = workspace?.course
  const notes = workspace?.notes || 'No notes available yet.'
  const progress = workspace?.progress ?? course?.progress ?? 0

  const renderContent = () => {
    if (loading) {
      return (
        <div className='text-center py-16 text-gray-500'>
          Loading workspace...
        </div>
      )
    }

    if (error || !mentee) {
      return (
        <div className='text-center py-16 text-gray-500'>
          <p>{error || 'Workspace not found.'}</p>
          <button
            onClick={() => navigate('/mentor')}
            className='mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700'
          >
            Back to Dashboard
          </button>
        </div>
      )
    }

    return (
      <>
        <div className='flex items-center justify-between mb-6'>
          <div>
            <p className='text-sm text-gray-500'>Mentor Workspace</p>
            <h2 className='text-2xl font-semibold'>{mentee.name}</h2>
            <p className='text-gray-600'>
              {course?.title || course?.domain || workspace?.domain || 'General learning track'}
            </p>
          </div>
          <button
            onClick={() => navigate('/mentor')}
            className='px-4 py-2 border rounded-lg text-sm hover:bg-gray-50'
          >
            ← Back
          </button>
        </div>

        <div className='grid gap-6'>
          <Card>
            <MentorChat mentee={{ name: mentee.name }} />
          </Card>

          <div className='grid md:grid-cols-2 gap-6'>
            <Card>
              <h3 className='text-lg font-semibold mb-4'>Course Progress</h3>
              <p className='text-sm text-gray-600 mb-2'>
                Current progress: {progress}%{workspace?.status === 'completed' ? ' (Completed)' : ''}
              </p>
              <div className='w-full bg-gray-100 rounded-full h-3'>
                <div
                  className='bg-blue-600 h-3 rounded-full'
                  style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
                />
              </div>
              {course?.domain && (
                <p className='text-sm text-gray-500 mt-3'>
                  Domain: {course.domain}
                </p>
              )}
            </Card>

            <Card>
              <h3 className='text-lg font-semibold mb-3'>Mentee Notes</h3>
              <div className='bg-gray-50 border rounded-xl p-4 text-sm text-gray-700 whitespace-pre-line min-h-[120px]'>
                {notes}
              </div>
            </Card>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <main className='max-w-6xl mx-auto p-6'>
        {renderContent()}
      </main>
      <Footer />
    </>
  )
}
