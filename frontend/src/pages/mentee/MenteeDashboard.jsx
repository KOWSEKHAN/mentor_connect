import Header from '../../components/Header'
import Footer from '../../components/Footer'
import Card from '../../components/Card'
import ToastContainer, { showToast } from '../../components/Toast'
import MentorDirectory from '../../components/mentee/MentorDirectory'
import { useState, useEffect } from 'react'
import { useAuth } from '../../utils/auth'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function MenteeDashboard(){
  const { user } = useAuth()
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

  // Fetch courses on mount
  useEffect(() => {
    fetchCourses()
    fetchRecommendations()
  }, [])

  const fetchCourses = async () => {
    try {
      const res = await api.get('/api/courses/me')
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

  return (
    <>
      <Header/>
      <ToastContainer />
      <main className="max-w-6xl mx-auto p-6">
        <h2 className="text-2xl font-semibold mb-6">Hello, {user?.name} (Mentee)</h2>
        
        {/* Section 1: Start a New Course */}
        <section className="mb-8">
          <Card>
            <h3 className="font-semibold text-xl mb-4">Start a New Course</h3>
            
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
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {loadingCourseSearch && (
                <div className="absolute right-3 top-3 text-gray-400 text-sm">Searching...</div>
              )}
              {selectedCourse && (
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-sm font-medium text-blue-800">
                    Suggestion: {selectedCourse.name} ({selectedCourse.type === 'domain' ? 'Domain' : 'Course'})
                  </span>
                  <button
                    onClick={() => {
                      setSelectedCourse(null)
                      // Keep courseQuery value, just clear selection
                    }}
                    className="ml-2 text-blue-600 hover:text-blue-800 text-sm"
                  >
                    ✕
                  </button>
                </div>
              )}
              {courseSuggestions.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
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
                        borderBottom: index < courseSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none'
                      }}
                      onMouseEnter={(e) => (e.target.style.background = '#E6F2FF')}
                      onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                    >
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500">
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
                className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {loadingMentorSearch && (
                <div className="absolute right-3 top-3 text-gray-400 text-sm">Searching...</div>
              )}
              {selectedMentor && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-sm font-medium text-green-800">
                    Selected: {selectedMentor.name} — Expertise: {selectedMentor.specialization}
                  </span>
                  <button
                    onClick={() => {
                      setSelectedMentor(null)
                      setMentorQuery('')
                    }}
                    className="ml-2 text-green-600 hover:text-green-800 text-sm"
                  >
                    ✕
                  </button>
                </div>
              )}
              {mentorSuggestions.length > 0 && !selectedMentor && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {mentorSuggestions.map((mentor, index) => (
                    <li
                      key={mentor._id}
                      onClick={() => {
                        setSelectedMentor(mentor)
                        setMentorQuery(mentor.name)
                        setMentorSuggestions([])
                      }}
                      style={{
                        cursor: 'pointer',
                        padding: '8px',
                        borderBottom: index < mentorSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none'
                      }}
                      onMouseEnter={(e) => (e.target.style.background = '#E6F2FF')}
                      onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                    >
                      <div className="font-medium">{mentor.name}</div>
                      <div className="text-xs text-gray-500">
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
              style={{
                cursor: courseQuery.trim() && !startingCourse ? 'pointer' : 'not-allowed',
                opacity: courseQuery.trim() && !startingCourse ? 1 : 0.5,
                transition: '0.2s',
                width: '100%',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                backgroundColor: courseQuery.trim() && !startingCourse ? '#2563eb' : '#9ca3af',
                color: 'white',
                fontWeight: '500',
                border: 'none'
              }}
            >
              {startingCourse ? 'Starting Course...' : (selectedMentor ? 'Request Mentor & Start Course' : 'Start Course')}
            </button>
            {selectedMentor && (
              <p className="mt-2 text-sm text-gray-600 text-center">
                A mentor request will be sent when you start the course.
              </p>
            )}
            {!selectedMentor && courseQuery.trim() && (
              <p className="mt-2 text-sm text-gray-600 text-center">
                Course will start in independent learning mode. You can add a mentor later.
              </p>
            )}
          </Card>
        </section>

        {/* Section 2: My Courses */}
        <section className="mb-8">
          <h3 className="font-semibold text-xl mb-4">My Courses</h3>
          {courses.length === 0 ? (
            <Card>
              <div className="text-center text-gray-500 py-8">
                No courses yet. Start by searching for a mentor above!
              </div>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
                <Card key={course._id} className="cursor-pointer hover:shadow-lg transition" onClick={() => handleOpenWorkspace(course._id)}>
                  <div className="mb-3">
                    <h4 className="font-semibold text-lg mb-1">{course.title}</h4>
                    <div className="text-sm text-gray-500 mb-2">{course.domain}</div>
                    <div className="text-sm text-gray-600">
                      Mentor: {course.mentor?.name || 'N/A'}
                    </div>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Progress</span>
                      <span className="text-gray-600">{course.progress || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all"
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
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                      >
                        Add Mentor
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleOpenWorkspace(course._id)
                      }}
                      className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition ${!course.mentor ? 'flex-1' : 'w-full'}`}
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Select a Mentor</h3>
                <button
                  onClick={() => {
                    setShowMentorPicker(false)
                    setCourseToAssign(null)
                    setSelectedMentor(null)
                    setMentorQuery('')
                  }}
                  className="text-gray-500 hover:text-gray-700"
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
                  className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {loadingMentorSearch && (
                  <div className="absolute right-3 top-3 text-gray-400 text-sm">Searching...</div>
                )}
                {selectedMentor && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <span className="text-sm font-medium text-green-800">
                      Selected: {selectedMentor.name} — Expertise: {selectedMentor.specialization}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedMentor(null)
                        setMentorQuery('')
                      }}
                      className="ml-2 text-green-600 hover:text-green-800 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                )}
                {mentorSuggestions.length > 0 && !selectedMentor && (
                  <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {mentorSuggestions.map((mentor, index) => (
                      <li
                        key={mentor._id}
                        onClick={() => {
                          setSelectedMentor(mentor)
                          setMentorQuery(mentor.name)
                          setMentorSuggestions([])
                        }}
                        style={{
                          cursor: 'pointer',
                          padding: '8px',
                          borderBottom: index < mentorSuggestions.length - 1 ? '1px solid #f3f4f6' : 'none'
                        }}
                        onMouseEnter={(e) => (e.target.style.background = '#E6F2FF')}
                        onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                      >
                        <div className="font-medium">{mentor.name}</div>
                        <div className="text-xs text-gray-500">
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
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignMentor}
                  disabled={!selectedMentor || assigningMentor === courseToAssign}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {assigningMentor === courseToAssign ? 'Assigning...' : 'Assign Mentor'}
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Section 3: Discover Mentors (Recommendations) */}
        <section>
          <h3 className="font-semibold text-xl mb-4">Discover Mentors</h3>
          <Card>
            <h4 className="font-semibold text-lg mb-2">Recommended for you</h4>
            <p className="text-sm text-gray-600 mb-4">
              These mentors are recommended based on your resume and interests.
            </p>

            {loadingRecommendations && (
              <div className="text-sm text-gray-500 py-4">Loading recommendations...</div>
            )}

            {!loadingRecommendations && recommendedMentors.length === 0 && (
              <div className="text-sm text-gray-500 py-4">
                No personalized recommendations yet. Try adding your interests and resume.
              </div>
            )}

            {!loadingRecommendations && recommendedMentors.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedMentors.map((mentor) => (
                  <div
                    key={mentor._id}
                    className="border rounded-lg p-4 bg-white shadow-sm"
                  >
                    <div className="mb-2">
                      <div className="font-semibold">{mentor.name}</div>
                      <div className="text-sm text-gray-500">{mentor.email}</div>
                    </div>
                    {mentor.interests && mentor.interests.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs text-gray-500 mb-1">Interests</div>
                        <div className="flex flex-wrap gap-1">
                          {mentor.interests.slice(0, 6).map((interest) => (
                            <span
                              key={interest}
                              className="px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {typeof mentor.sharedInterestsCount === 'number' && (
                      <div className="mt-3 text-xs text-gray-500">
                        Shared interests: {mentor.sharedInterestsCount}
                      </div>
                    )}
                    {/* Intentionally no Request Mentor button in recommendations list */}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>
      </main>
      <Footer/>
    </>
  )
}


