import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Users, MessageCircle, Sparkles, User } from 'lucide-react'

const NAV_ITEMS = [
  { path: '/mentee', label: 'Dashboard', icon: LayoutDashboard, roles: ['mentee'] },
  { path: '/mentor', label: 'Dashboard', icon: LayoutDashboard, roles: ['mentor'] },
  { path: '/mentee', label: 'Courses', icon: BookOpen, roles: ['mentee'] },
  { path: '/mentor', label: 'Mentees', icon: Users, roles: ['mentor'] },
  { path: '/community', label: 'Community', icon: MessageCircle, roles: ['mentee', 'mentor'] },
  { path: '/mentee', label: 'AI Assistant', icon: Sparkles, roles: ['mentee'], sub: 'In workspace' },
  { path: '/mentee/profile', label: 'Profile', icon: User, roles: ['mentee'] },
  { path: '/mentor/profile', label: 'Profile', icon: User, roles: ['mentor'] },
]

export default function AppSidebar({ userRole }) {
  const location = useLocation()
  const filtered = NAV_ITEMS.filter((item) => item.roles.includes(userRole))
  const uniq = filtered.filter((item, i) => {
    const key = item.path + item.label
    return filtered.findIndex((x) => x.path + x.label === key) === i
  })

  return (
    <aside className="w-[260px] flex-shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col min-h-screen">
      <div className="p-4 border-b border-slate-800">
        <Link to={userRole === 'mentor' ? '/mentor' : '/mentee'} className="text-xl font-semibold text-white">
          MentorConnect
        </Link>
      </div>
      <nav className="p-2 flex-1">
        {uniq.map((item) => {
          const Icon = item.icon
          const isActive =
            location.pathname === item.path ||
            (item.path === '/mentee' && location.pathname.startsWith('/mentee') && !location.pathname.includes('profile')) ||
            (item.path === '/mentor' && location.pathname.startsWith('/mentor') && !location.pathname.includes('profile'))
          return (
            <Link
              key={item.path + item.label}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
              {item.sub && <span className="text-xs text-slate-500 ml-auto">{item.sub}</span>}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
