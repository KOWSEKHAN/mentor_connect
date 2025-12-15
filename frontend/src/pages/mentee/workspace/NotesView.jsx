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
    <div className="bg-white rounded-2xl shadow p-6 h-full flex flex-col">
      <h3 className="text-xl font-semibold mb-4">Notes</h3>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Take notes here... They will be auto-saved."
        className="flex-1 w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  )
}

