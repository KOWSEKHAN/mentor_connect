import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/auth'

export default function Header(){
  const { user, logout } = useAuth()
  const nav = useNavigate()
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="text-2xl font-bold text-blue-600">MentorConnect</div>
        <nav className="space-x-4">
          <Link to="/" className="text-gray-600 hover:text-blue-600">Home</Link>
          {!user && <Link to="/auth" className="text-gray-600 hover:text-blue-600">Sign In / Sign Up</Link>}
          {user && (
            <>
              <Link 
                to={user.role === 'mentor' ? '/mentor/profile' : '/mentee/profile'} 
                className="text-gray-600 hover:text-blue-600"
              >
                Profile
              </Link>
              <button onClick={()=>{ logout(); nav('/') }} className="text-gray-600 hover:text-red-600">Logout</button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
