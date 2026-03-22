import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'

const EXAMPLE_NOTIFICATIONS = [
  { id: 1, title: 'New mentor accepted request', body: 'A mentor accepted your course request.', time: '2m ago', type: 'mentor' },
  { id: 2, title: 'New community message', body: 'Someone replied in Community chat.', time: '5m ago', type: 'community' },
  { id: 3, title: 'AI roadmap ready', body: 'Your learning roadmap has been generated.', time: '1h ago', type: 'ai' },
]

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        <span className="absolute top-1 right-1 w-2 h-2 bg-indigo-500 rounded-full" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-700">
            <h3 className="font-semibold text-slate-100">Notifications</h3>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {EXAMPLE_NOTIFICATIONS.map((n) => (
              <div
                key={n.id}
                className="p-3 border-b border-slate-800 last:border-0 hover:bg-slate-800/50 transition-colors"
              >
                <p className="font-medium text-sm text-slate-200">{n.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                <p className="text-xs text-slate-500 mt-1">{n.time}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
