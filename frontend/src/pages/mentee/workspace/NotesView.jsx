import { useState, useEffect } from 'react'
import { showToast } from '../../../components/Toast'

export default function NotesView({ course, updateCourse, refreshCourse }) {
  const [notes, setNotes] = useState(course.notes || '')

  useEffect(() => {
    setNotes(course.notes || '')
  }, [course])

  // Auto-save on notes change (debounced)
  useEffect(() => {
    if (notes === course.notes) return

    const timeoutId = setTimeout(() => {
      updateCourse({ notes })
      showToast('Notes saved!', 'success')
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [notes])

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 h-full flex flex-col text-gray-300">
      <h3 className="text-xl font-semibold mb-4 text-white">Notes</h3>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Take notes here... They will be auto-saved."
        className="flex-1 w-full p-4 border border-gray-700 bg-gray-900 text-white placeholder:text-gray-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  )
}

