import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/auth'
import { useCommunityUnread } from '../context/CommunityUnreadContext'
import NotificationDropdown from './NotificationDropdown'

export default function Header() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const { unreadCount } = useCommunityUnread()

  return (
    <header className="bg-slate-950/80 backdrop-blur-xl border-b border-slate-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <Link to={user ? (user.role === 'mentor' ? '/mentor' : '/mentee') : '/'} className="text-xl font-bold text-white">
          MentorConnect
        </Link>
        <nav className="flex items-center gap-2">
          {user && (
            <Link
              to="/"
              className="px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
            >
              Home
            </Link>
          )}
          {!user && (
            <>
              <Link
                to="/auth"
                className="px-4 py-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 transition-all text-sm font-medium"
              >
                Sign In
              </Link>
              <Link
                to="/auth"
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-lg transition-all duration-200 text-sm font-medium"
              >
                Sign Up
              </Link>
            </>
          )}
          {user && (
            <>
              <Link
                to="/community"
                className="relative px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium flex items-center gap-2"
              >
                Community
                {unreadCount > 0 && (
                  <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-medium text-white bg-red-500 rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
              <NotificationDropdown />
              <Link
                to={user.role === 'mentor' ? '/mentor/profile' : '/mentee/profile'}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium"
              >
                Profile
              </Link>
              <button
                onClick={() => {
                  logout()
                  nav('/')
                }}
                className="px-3 py-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm font-medium"
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
