import { useState, useEffect, useCallback } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

function LockIcon() {
  return (
    <svg className="w-16 h-16 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

export default function Certificate({ course, courseId, user }) {
  const [certData, setCertData] = useState(null)
  const [loadingCert, setLoadingCert] = useState(false)
  const [existingReview, setExistingReview] = useState(null)
  const [loadingReview, setLoadingReview] = useState(false)
  const [rating, setRating] = useState(5)
  const [reviewText, setReviewText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isCourseComplete =
    course?.status === 'completed' || (course?.progress ?? 0) >= 100

  const mentorshipId = course?.mentorshipId
  const canReview = Boolean(mentorshipId && course?.mentor)

  const fetchCertificate = useCallback(async () => {
    if (!courseId || !isCourseComplete) return
    setLoadingCert(true)
    try {
      const res = await api.get(`/api/certificate/${courseId}`)
      setCertData(res.data)
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.locked) {
        setCertData(null)
      } else {
        console.error(err)
        showToast(err.response?.data?.message || 'Could not load certificate', 'error')
      }
    } finally {
      setLoadingCert(false)
    }
  }, [courseId, isCourseComplete])

  const fetchMyReview = useCallback(async () => {
    if (!mentorshipId || !isCourseComplete || !canReview) return
    setLoadingReview(true)
    try {
      const res = await api.get(`/api/reviews/for-mentorship/${mentorshipId}`)
      setExistingReview(res.data?.review || null)
    } catch {
      setExistingReview(null)
    } finally {
      setLoadingReview(false)
    }
  }, [mentorshipId, isCourseComplete, canReview])

  useEffect(() => {
    if (isCourseComplete) {
      fetchCertificate()
      fetchMyReview()
    } else {
      setCertData(null)
      setExistingReview(null)
    }
  }, [isCourseComplete, fetchCertificate, fetchMyReview])

  const handleSubmitReview = async (e) => {
    e.preventDefault()
    if (!mentorshipId) return
    setSubmitting(true)
    try {
      await api.post('/api/reviews', {
        mentorshipId,
        rating,
        reviewText: reviewText.trim(),
      })
      showToast('Thank you for your review!', 'success')
      setReviewText('')
      fetchMyReview()
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit review', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isCourseComplete) {
    return (
      <div className="w-full max-w-lg mx-auto text-center py-12 px-6">
        <LockIcon />
        <h3 className="text-xl font-semibold text-white mb-2">Certificate locked</h3>
        <p className="text-slate-400 mb-6">
          Complete the course to unlock your certificate and optional mentor review.
        </p>
        <p className="text-sm text-slate-500 mb-4">Progress: {course?.progress ?? 0}%</p>
        <button
          type="button"
          disabled
          className="px-6 py-2 rounded-xl bg-slate-700 text-slate-500 cursor-not-allowed text-sm font-medium"
        >
          View certificate
        </button>
      </div>
    )
  }

  if (loadingCert && !certData) {
    return (
      <div className="w-full flex justify-center py-16 text-slate-400 text-sm">Loading certificate…</div>
    )
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-10">
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-amber-500/40 rounded-2xl p-8 md:p-10 shadow-xl text-center">
        <p className="text-amber-200/90 text-sm uppercase tracking-widest mb-2">Certificate of Completion</p>
        <h3 className="text-2xl md:text-3xl font-bold text-white mb-6">
          {certData?.courseName || course?.title}
        </h3>
        <p className="text-slate-300 mb-1">Awarded to</p>
        <p className="text-xl font-semibold text-white mb-6">
          {certData?.menteeName || user?.name || 'Learner'}
        </p>
        <div className="text-left inline-block text-slate-300 space-y-2 text-sm md:text-base">
          <p>
            <span className="text-slate-500">Course: </span>
            {certData?.courseName || course?.title}
          </p>
          <p>
            <span className="text-slate-500">Mentor: </span>
            {certData?.mentorName || course?.mentor?.name || '—'}
          </p>
          <p>
            <span className="text-slate-500">Date: </span>
            {certData?.completedAt
              ? new Date(certData.completedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => showToast('PDF download coming soon', 'info')}
          className="mt-8 px-5 py-2.5 rounded-xl border border-slate-600 text-slate-200 hover:bg-white/5 text-sm font-medium transition-colors"
        >
          Download as PDF (soon)
        </button>
      </div>

      {canReview && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
          <h4 className="text-lg font-semibold text-white mb-2">Rate your mentor</h4>
          <p className="text-sm text-slate-400 mb-4">
            Share feedback after completing your journey. One review per mentorship.
          </p>
          {loadingReview ? (
            <p className="text-slate-500 text-sm">Loading review…</p>
          ) : existingReview ? (
            <div className="rounded-lg bg-slate-900/60 border border-slate-700 p-4">
              <p className="text-amber-300 text-sm font-medium mb-1">
                {'★'.repeat(existingReview.rating)}
                <span className="text-slate-500 ml-2">({existingReview.rating}/5)</span>
              </p>
              {existingReview.reviewText ? (
                <p className="text-slate-300 text-sm whitespace-pre-wrap">{existingReview.reviewText}</p>
              ) : null}
              <p className="text-xs text-emerald-400 mt-3">Submitted</p>
            </div>
          ) : (
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-2">Rating (1–5)</label>
                <div className="flex gap-2 flex-wrap">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${
                        rating === n
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-2">Review (optional)</label>
                <textarea
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={4}
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-600 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-sm"
                  placeholder="What went well? What could improve?"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit review'}
              </button>
            </form>
          )}
        </div>
      )}

      {!canReview && isCourseComplete && (
        <p className="text-center text-slate-500 text-sm">
          Mentor reviews are available when this course is linked to an assigned mentor.
        </p>
      )}
    </div>
  )
}
