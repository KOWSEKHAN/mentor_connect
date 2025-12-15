import { useState, useEffect } from 'react'
import api from '../../utils/api'
import { showToast } from '../Toast'
import Pagination from '../common/Pagination'

export default function MentorDirectory({ onRequestMentor }) {
  const [mentors, setMentors] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  })

  const fetchMentors = async (page = 1) => {
    setLoading(true)
    try {
      const limit = pagination.limit || 12
      const res = await api.get(`/api/mentors/all?page=${page}&limit=${limit}`)
      setMentors(res.data.mentors || [])
      setPagination(res.data.pagination || pagination)
    } catch (err) {
      console.error('Failed to fetch mentors:', err)
      showToast('Failed to load mentors', 'error')
      setMentors([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMentors(1)
  }, [])

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchMentors(newPage)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const handleRequest = async (mentor) => {
    if (onRequestMentor) {
      await onRequestMentor(mentor)
    }
  }

  if (loading && mentors.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading mentors...</p>
      </div>
    )
  }

  if (!loading && mentors.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No mentors available at the moment.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mentors.map((mentor) => (
          <div
            key={mentor._id}
            className="bg-white rounded-2xl shadow p-6 hover:shadow-lg transition"
          >
            <div className="mb-4">
              <h4 className="font-semibold text-lg mb-2">{mentor.name}</h4>
              <div className="text-sm text-gray-500 mb-2">
                {mentor.email}
              </div>
              <div className="text-sm text-gray-600 mb-2">
                Skills/Expertise: <span className="text-gray-500">General</span>
              </div>
              <div className="flex items-center text-sm text-gray-600">
                <span className="mr-1">Rating:</span>
                <span className="text-gray-500">Not Rated</span>
              </div>
            </div>
            <button
              onClick={() => handleRequest(mentor)}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              Request Mentor
            </button>
          </div>
        ))}
      </div>

      {pagination.totalPages > 1 && (
        <Pagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  )
}

