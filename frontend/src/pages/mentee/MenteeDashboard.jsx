import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Card from '../../components/Card'
import AppSidebar from '../../components/AppSidebar'
import FloatingActionButton from '../../components/FloatingActionButton'
import ToastContainer, { showToast } from '../../components/Toast'
import MentorDirectory from '../../components/mentee/MentorDirectory'
import Skeleton from '../../components/ui/Skeleton'
import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import { useAuth } from '../../utils/auth'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function MenteeDashboard(){
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState([])
  const [recommendedMentors, setRecommendedMentors] = useState([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)
  
  // Start New Course states
  const [courseQuery, setCourseQuery] = useState('')
  const [mentorQuery, setMentorQuery] = useState('')
  const [courseSuggestions, setCourseSuggestions] = useState([])
  const [mentorSuggestions, setMentorSuggestions] = useState([])
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [selectedMentor, setSelectedMentor] = useState(null)
  const [loadingCourseSearch, setLoadingCourseSearch] = useState(false)
  const [loadingMentorSearch, setLoadingMentorSearch] = useState(false)
  const [startingCourse, setStartingCourse] = useState(false)
  const [assigningMentor, setAssigningMentor] = useState(null)
  const [showMentorPicker, setShowMentorPicker] = useState(false)
  const [courseToAssign, setCourseToAssign] = useState(null)

  // Find Mentors
  const [findMentorsQuery, setFindMentorsQuery] = useState('')
  const [findMentors, setFindMentors] = useState([])
  const [loadingFindMentors, setLoadingFindMentors] = useState(false)

  // Fetch courses on mount
  useEffect(() => {
    fetchCourses()
    fetchRecommendations()
    fetchFindMentors()
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .get('/api/points/summary')
      .then((res) => {
        if (cancelled) return
        const bal = res.data?.balance ?? 0
        updateUser?.({ points: bal })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const fetchCourses = async () => {
    try {
      const res = await api.get('/api/mentee/courses')
      setCourses(res.data.courses || [])
    } catch (err) {
      console.error('Failed to fetch courses:', err)
      showToast('Failed to load courses', 'error')
    }
  }

  const fetchRecommendations = async () => {
    setLoadingRecommendations(true)
    try {
      const res = await api.get('/api/mentee/recommendations')
      setRecommendedMentors(res.data.mentors || [])
    } catch (err) {
      console.error('Failed to fetch mentor recommendations:', err)
      setRecommendedMentors([])
    } finally {
      setLoadingRecommendations(false)
    }
  }

  const fetchFindMentors = async () => {
    setLoadingFindMentors(true)
    try {
      const res = await api.get('/api/mentors')
      setFindMentors(res.data.mentors || [])
    } catch (err) {
      console.error('Failed to fetch mentors:', err)
      setFindMentors([])
    } finally {
      setLoadingFindMentors(false)
    }
  }

  // Fetch course + specialization suggestions
  useEffect(() => {
    if (courseQuery.length > 1) {
      const timeoutId = setTimeout(() => {
        searchCourseAndDomain(courseQuery)
      }, 500)
      return () => clearTimeout(timeoutId)
    } else {
      setCourseSuggestions([])
    }
  }, [courseQuery])

  const searchCourseAndDomain = async (query) => {
    if (!query.trim()) return
    setLoadingCourseSearch(true)
    try {
      const res = await api.get(`/api/search/course?query=${encodeURIComponent(query)}`)
      setCourseSuggestions(res.data.suggestions || [])
    } catch (err) {
      console.error('Failed to search courses/domains:', err)
      setCourseSuggestions([])
    } finally {
      setLoadingCourseSearch(false)
    }
  }

  // Fetch mentor name suggestions
  useEffect(() => {
    if (mentorQuery.length > 1) {
      const timeoutId = setTimeout(() => {
        searchMentorByName(mentorQuery)
      }, 500)
      return () => clearTimeout(timeoutId)
    } else {
      setMentorSuggestions([])
    }
  }, [mentorQuery])

  const searchMentorByName = async (name) => {
    if (!name.trim()) return
    setLoadingMentorSearch(true)
    try {
      const res = await api.get(`/api/search/mentor?name=${encodeURIComponent(name)}`)
      setMentorSuggestions(res.data.mentors || [])
    } catch (err) {
      console.error('Failed to search mentors:', err)
      setMentorSuggestions([])
    } finally {
      setLoadingMentorSearch(false)
    }
  }

  const handleStartCourse = async () => {
    const domainName = courseQuery.trim()
    
    if (!domainName) {
      showToast('Please enter a domain name', 'error')
      return
    }

    setStartingCourse(true)
    try {
      const payload = {
        course: {
          name: domainName,
          type: 'domain'
        },
        mentor: selectedMentor || null
      }

      const res = await api.post('/api/course/start', payload)
      showToast(res.data.message || 'Course started successfully!', 'success')
      
      // Immediately add the new course to local state
      if (res.data.course) {
        setCourses(prevCourses => [...prevCourses, res.data.course])
      }
      
      // Reset form
      setCourseQuery('')
      setMentorQuery('')
      setSelectedCourse(null)
      setSelectedMentor(null)
      setCourseSuggestions([])
      setMentorSuggestions([])
      
      // Also refresh courses list to ensure consistency
      fetchCourses()
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Error starting course'
      showToast(errorMsg, 'error')
    } finally {
      setStartingCourse(false)
    }
  }

  const handleOpenWorkspace = (courseId) => {
    navigate(`/mentee/course/${courseId}`)
  }

  const openMentorPicker = (courseId) => {
    setCourseToAssign(courseId)
    setShowMentorPicker(true)
    setMentorQuery('')
    setSelectedMentor(null)
  }

  const handleAssignMentor = async () => {
    if (!selectedMentor || !courseToAssign) return

    setAssigningMentor(courseToAssign)
    try {
      await api.patch(`/api/courses/${courseToAssign}/assign-mentor`, {
        mentorId: selectedMentor._id
      })
      showToast('Mentor assigned successfully!', 'success')
      setShowMentorPicker(false)
      setCourseToAssign(null)
      setSelectedMentor(null)
      setMentorQuery('')
      // Refresh courses
      fetchCourses()
    } catch (err) {
      console.error('Failed to assign mentor:', err)
      showToast(err.response?.data?.message || 'Failed to assign mentor', 'error')
    } finally {
      setAssigningMentor(null)
    }
  }

  const normalizedFindMentorsQuery = findMentorsQuery.trim().toLowerCase()
  const filteredFindMentors = !normalizedFindMentorsQuery
    ? findMentors
    : findMentors.filter(
        (m) =>
          (m.mentor_id || '').toLowerCase().includes(normalizedFindMentorsQuery) ||
          (m.name || '').toLowerCase().includes(normalizedFindMentorsQuery)
      )

  return (
    <>
      <Header />
      <div className="flex min-h-screen">
        <AppSidebar userRole="mentee" />
        <main className="flex-1 w-full min-h-screen px-6 py-4">
          <ToastContainer />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
          >
        <h2 className="text-2xl font-semibold text-slate-100">Hello, {user?.name}</h2>

        {/* Analytics cards */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl hover:scale-[1.02] transition-all duration-200">
            <p className="text-sm text-slate-400">Active courses</p>
            <p className="text-3xl font-semibold text-white mt-1">{courses.length}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl hover:scale-[1.02] transition-all duration-200">
            <p className="text-sm text-slate-400">With mentor</p>
            <p className="text-3xl font-semibold text-white mt-1">{courses.filter((c) => c.mentor).length}</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl hover:scale-[1.02] transition-all duration-200">
            <p className="text-sm text-slate-400">Avg. progress</p>
            <p className="text-3xl font-semibold text-white mt-1">
              {courses.length ? Math.round(courses.reduce((a, c) => a + (c.progress || 0), 0) / courses.length) : 0}%
            </p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl hover:scale-[1.02] transition-all duration-200">
            <p className="text-sm text-slate-400">Points balance</p>
            <p className="text-3xl font-semibold text-amber-300 mt-1 tabular-nums">{user?.points ?? 0}</p>
          </div>
        </section>
        
        {/* Section 1: Start a New Course */}
        <section className="mb-8">
          <Card className="text-slate-100 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl">
            <h3 className="font-semibold text-xl mb-4 text-white">Start a New Course</h3>
            
            {/* Domain / Course Name Input */}
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Domain / Course Name"
                value={courseQuery}
                onChange={(e) => {
                  setCourseQuery(e.target.value)
                  if (!e.target.value) {
                    setSelectedCourse(null)
                    setCourseSuggestions([])
                  }
                }}
                className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {loadingCourseSearch && (
                <div className="absolute right-3 top-3 text-slate-400 text-sm">Searching...</div>
              )}
              {selectedCourse && (
                <div className="mt-2 p-2 bg-indigo-500/20 border border-indigo-500/30 rounded-xl">
                  <span className="text-sm font-medium text-indigo-200">
                    Suggestion: {selectedCourse.name} ({selectedCourse.type === 'domain' ? 'Domain' : 'Course'})
                  </span>
                  <button
                    onClick={() => {
                      setSelectedCourse(null)
                      // Keep courseQuery value, just clear selection
                    }}
                    className="ml-2 text-indigo-400 hover:text-indigo-300 text-sm"
                  >
                    ✕
                  </button>
                </div>
              )}
              {courseSuggestions.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                  {courseSuggestions.map((item, index) => (
                    <li
                      key={index}
                      onClick={() => {
                        setSelectedCourse(item)
                        setCourseQuery(item.name)
                        setCourseSuggestions([])
                      }}
                      style={{
                        cursor: 'pointer',
                        padding: '8px',
                        borderBottom: index < courseSuggestions.length - 1 ? '1px solid rgba(51,65,85,0.5)' : 'none'
                      }}
                      className="hover:bg-white/5 rounded-lg"
                    >
                      <div className="font-medium text-slate-200">{item.name}</div>
                      <div className="text-xs text-slate-500">
                        {item.type === 'domain' ? 'Domain/Specialization' : 'Course'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Search Mentor by Name (Optional) */}
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Search mentor by name (optional)..."
                value={mentorQuery}
                onChange={(e) => {
                  setMentorQuery(e.target.value)
                  if (!e.target.value) {
                    setSelectedMentor(null)
                    setMentorSuggestions([])
                  }
                }}
                className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {loadingMentorSearch && (
                <div className="absolute right-3 top-3 text-slate-400 text-sm">Searching...</div>
              )}
              {selectedMentor && (
                <div className="mt-2 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                  <span className="text-sm font-medium text-green-300">
                    Selected: {selectedMentor.name} — Expertise: {selectedMentor.specialization}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedMentor(null)
                      setMentorQuery('')
                    }}
                    className="ml-2 text-green-400 hover:text-green-300 text-sm"
                  >
                    ✕
                  </button>
                </div>
              )}
              {mentorSuggestions.length > 0 && !selectedMentor && (
                <ul className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                  {mentorSuggestions.map((mentor, index) => (
                    <li
                      key={mentor._id}
                      onClick={() => {
                        setSelectedMentor(mentor)
                        setMentorQuery(mentor.name)
                        setMentorSuggestions([])
                      }}
                      className={`px-3 py-2 cursor-pointer hover:bg-white/10 text-slate-200 ${index < mentorSuggestions.length - 1 ? 'border-b border-slate-700' : ''}`}
                    >
                      <div className="font-medium">{mentor.name}</div>
                      <div className="text-xs text-slate-400">
                        Expertise: {mentor.specialization}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Start Course Button */}
            <button
              disabled={!courseQuery.trim() || startingCourse}
              onClick={handleStartCourse}
              className="w-full py-2.5 px-4 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/20"
            >
              {startingCourse ? 'Starting Course...' : (selectedMentor ? 'Request Mentor & Start Course' : 'Start Course')}
            </button>
            {selectedMentor && (
              <p className="mt-2 text-sm text-slate-400 text-center">
                A mentor request will be sent when you start the course.
              </p>
            )}
            {!selectedMentor && courseQuery.trim() && (
              <p className="mt-2 text-sm text-slate-400 text-center">
                Course will start in independent learning mode. You can add a mentor later.
              </p>
            )}
          </Card>
        </section>

        {/* Section 2: My Courses */}
        <section className="mb-8">
          <h3 className="font-semibold text-xl mb-4 text-white">My Courses</h3>
          {courses.length === 0 ? (
            <Card className="text-slate-400">
              <div className="text-center py-8">
                No courses yet. Start by searching for a mentor above!
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <Card key={course._id} className="cursor-pointer hover:scale-[1.02] transition-all duration-200 text-slate-100 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl" onClick={() => handleOpenWorkspace(course._id)}>
                  <div className="mb-3">
                    <h4 className="font-semibold text-lg mb-1 text-white">{course.title}</h4>
                    <div className="text-sm text-slate-400 mb-2">{course.domain}</div>
                    <div className="text-sm text-slate-300">
                      Mentor: {course.mentor?.name || 'N/A'}
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Progress</span>
                      <span className="text-slate-300">{course.progress || 0}%</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${course.progress || 0}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {!course.mentor && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openMentorPicker(course._id)
                        }}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm"
                      >
                        Add Mentor
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenWorkspace(course._id)
                      }}
                      className={`px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 hover:shadow-indigo-500/20 transition-all text-sm ${!course.mentor ? 'flex-1' : 'w-full'}`}
                    >
                      Open Workspace
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Mentor Picker Modal */}
        {showMentorPicker && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <Card className="max-w-md w-full mx-4 text-slate-100 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold text-white">Select a Mentor</h3>
                <button
                  onClick={() => {
                    setShowMentorPicker(false)
                    setCourseToAssign(null)
                    setSelectedMentor(null)
                    setMentorQuery('')
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
              
              <div className="relative mb-4">
                <input
                  type="text"
                  placeholder="Search mentor by name..."
                  value={mentorQuery}
                  onChange={(e) => {
                    setMentorQuery(e.target.value)
                    if (!e.target.value) {
                      setSelectedMentor(null)
                      setMentorSuggestions([])
                    }
                  }}
                  className="w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                {loadingMentorSearch && (
                  <div className="absolute right-3 top-3 text-slate-400 text-sm">Searching...</div>
                )}
                {selectedMentor && (
                  <div className="mt-2 p-2 bg-green-500/20 border border-green-500/30 rounded-lg">
                    <span className="text-sm font-medium text-green-300">
                      Selected: {selectedMentor.name} — Expertise: {selectedMentor.specialization}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedMentor(null)
                        setMentorQuery('')
                      }}
                      className="ml-2 text-green-400 hover:text-green-300 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {mentorSuggestions.length > 0 && !selectedMentor && (
                  <ul className="absolute z-10 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                    {mentorSuggestions.map((mentor, index) => (
                      <li
                        key={mentor._id}
                        onClick={() => {
                          setSelectedMentor(mentor)
                          setMentorQuery(mentor.name)
                          setMentorSuggestions([])
                        }}
                        className={`px-3 py-2 cursor-pointer hover:bg-white/10 text-slate-200 ${index < mentorSuggestions.length - 1 ? 'border-b border-slate-700' : ''}`}
                      >
                        <div className="font-medium">{mentor.name}</div>
                        <div className="text-xs text-slate-400">
                          Expertise: {mentor.specialization}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowMentorPicker(false)
                    setCourseToAssign(null)
                    setSelectedMentor(null)
                    setMentorQuery('')
                  }}
                  className="px-4 py-2 border border-slate-600 rounded-xl hover:bg-white/5 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignMentor}
                  disabled={!selectedMentor || assigningMentor === courseToAssign}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                >
                  {assigningMentor === courseToAssign ? 'Assigning...' : 'Assign Mentor'}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Section: Find Mentors */}
        <section className="mb-8">
          <h3 className="font-semibold text-xl mb-4 text-white">Find Mentors</h3>
          <div className="relative mb-4">
            <input
              type="text"
              value={findMentorsQuery}
              onChange={(e) => setFindMentorsQuery(e.target.value)}
              placeholder="Search by mentor_id or username..."
              className="w-full p-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {loadingFindMentors && (
              <div className="absolute right-3 top-3 text-gray-400 text-sm">Loading...</div>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-3 pr-1">
            {loadingFindMentors && filteredFindMentors.length === 0 && (
              <div className="text-sm text-gray-400 py-6 text-center border border-gray-700 rounded-xl bg-gray-800/30">
                Loading mentors...
              </div>
            )}
            {(!loadingFindMentors && filteredFindMentors.length === 0) && (
              <div className="text-sm text-gray-400 py-6 text-center border border-gray-700 rounded-xl bg-gray-800/30">
                No mentors found.
              </div>
            )}

            {filteredFindMentors.map((mentor) => (
              <div
                key={mentor.mentor_id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-white">{mentor.name}</div>
                    <div className="text-xs text-gray-300 mt-1">
                      Mentor ID: <span className="font-mono">{mentor.mentor_id}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-200">
                      Rating: {typeof mentor.rating === 'number' ? mentor.rating.toFixed(1) : '0.0'}
                    </div>
                    <div className="text-xs text-gray-400">
                      {mentor.totalReviews || 0} reviews
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Section 3: Discover Mentors (Recommendations) */}
        <section>
          <h3 className="font-semibold text-xl mb-4 text-white">Discover Mentors</h3>
          <Card className="text-slate-100 bg-white/5 backdrop-blur-xl border border-white/10 rounded-xl p-6 shadow-xl">
            <h4 className="font-semibold text-lg mb-2 text-white">Recommended for you</h4>
            <p className="text-sm text-slate-400 mb-4">
              These mentors are recommended based on your resume and interests.
            </p>

            {loadingRecommendations && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            )}

            {!loadingRecommendations && recommendedMentors.length === 0 && (
              <div className="text-sm text-slate-500 py-4">
                No personalized recommendations yet. Try adding your interests and resume.
              </div>
            )}

            {!loadingRecommendations && recommendedMentors.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedMentors.map((mentor) => (
                  <div
                    key={mentor._id}
                    className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:scale-[1.02] transition-transform duration-200"
                  >
                    <div className="mb-2">
                      <div className="font-semibold text-slate-200">{mentor.name}</div>
                      <div className="text-sm text-slate-500">{mentor.email}</div>
                    </div>
                    {mentor.interests && mentor.interests.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs text-slate-500 mb-1">Interests</div>
                        <div className="flex flex-wrap gap-1">
                          {mentor.interests.slice(0, 6).map((interest) => (
                            <span
                              key={interest}
                              className="px-2 py-0.5 rounded-full bg-slate-700 text-xs text-slate-300"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {typeof mentor.sharedInterestsCount === 'number' && (
                      <div className="mt-3 text-xs text-slate-500">
                        Shared interests: {mentor.sharedInterestsCount}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
          </motion.div>
        </main>
        <FloatingActionButton userRole="mentee" />
      </div>
      <Footer/>
    </>
  )
}


