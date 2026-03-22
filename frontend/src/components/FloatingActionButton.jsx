import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'

export default function FloatingActionButton({ userRole }) {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-40">
      <Link
        to="/community"
        className="flex items-center justify-center w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-xl hover:shadow-lg transition-all duration-200 hover:scale-105"
        title="Community Chat"
      >
        <MessageCircle className="w-6 h-6" />
      </Link>
    </div>
  )
}
