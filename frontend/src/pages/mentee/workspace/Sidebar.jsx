export default function Sidebar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'ai-content', label: 'AI Content' },
    { id: 'roadmap', label: 'Roadmap' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'notes', label: 'Notes' },
    { id: 'certificate', label: 'Certificate' },
    { id: 'chat', label: 'Chat with Mentor' }
  ]

  return (
    <div className="bg-slate-900 border-r border-slate-700 rounded-xl p-4 h-full min-h-0 flex flex-col">
      <h3 className="font-semibold mb-4 text-white flex-shrink-0">Workspace</h3>
      <nav className="space-y-2 overflow-y-auto min-h-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full text-left px-4 py-2 rounded-lg transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

