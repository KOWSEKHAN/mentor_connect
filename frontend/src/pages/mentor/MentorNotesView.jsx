export default function MentorNotesView({ notes }) {
  return (
    <div className="h-full flex flex-col bg-gray-800 border border-gray-700 rounded-xl shadow-lg p-6 text-gray-300 min-h-0">
      <h3 className="text-xl font-semibold mb-4 text-white flex-shrink-0">Mentee Notes</h3>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="w-full h-full p-4 border border-gray-700 bg-gray-900 text-white rounded-lg whitespace-pre-wrap">
          {notes?.trim() || 'No notes shared by the mentee yet.'}
        </div>
      </div>
    </div>
  )
}
