export default function OverviewView({ course }) {
  return (
    <div className="bg-white rounded-2xl shadow p-6 h-full">
      <h3 className="text-xl font-semibold mb-4">Course Overview</h3>
      
      <div className="space-y-4">
        <div>
          <h4 className="font-medium text-gray-700 mb-2">Course Information</h4>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p><span className="font-medium">Title:</span> {course.title}</p>
            <p><span className="font-medium">Domain:</span> {course.domain}</p>
            <p><span className="font-medium">Mentor:</span> {course.mentor?.name}</p>
            <p><span className="font-medium">Progress:</span> {course.progress || 0}%</p>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-700 mb-2">Progress Overview</h4>
          <div className="w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all"
              style={{ width: `${course.progress || 0}%` }}
            ></div>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-gray-700 mb-2">Quick Stats</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {course.roadmap?.filter(r => r.completed).length || 0}
              </div>
              <div className="text-sm text-gray-600">Roadmap Steps Completed</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {course.tasks?.filter(t => t.completed).length || 0}
              </div>
              <div className="text-sm text-gray-600">Tasks Completed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

