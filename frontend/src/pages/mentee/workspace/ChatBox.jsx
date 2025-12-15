import { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import api from '../../../utils/api'

export default function ChatBox({ course, userId, userName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const socketRef = useRef(null)
  const messagesEndRef = useRef(null)

  const mentorId = course.mentor?._id || course.mentor
  const menteeId = course.mentee?._id || course.mentee
  const courseId = course._id
  const mentorName = course?.mentor?.name || 'No mentor assigned yet'
  const roomName = mentorId ? `mentor_${mentorId}_mentee_${menteeId}_course_${courseId}` : `course_${courseId}_mentee_${menteeId}`

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('http://localhost:5000', {
      transports: ['websocket']
    })

    socketRef.current.on('connect', () => {
      console.log('Connected to socket')
      socketRef.current.emit('join-room', roomName)
    })

    socketRef.current.on('chat-message', (data) => {
      setMessages(prev => [...prev, data])
      setIsTyping(false)
    })

    socketRef.current.on('typing', (data) => {
      setIsTyping(data.isTyping)
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave-room', roomName)
        socketRef.current.disconnect()
      }
    }
  }, [roomName])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const messageData = {
      room: roomName,
      from: userName,
      message: input.trim(),
      userId
    }

    socketRef.current.emit('chat-message', messageData)
    setInput('')
    setTyping(false)
  }

  const handleTyping = (e) => {
    setInput(e.target.value)
    
    if (!typing) {
      setTyping(true)
      socketRef.current.emit('typing', {
        room: roomName,
        user: userName,
        isTyping: true
      })
    }

    clearTimeout(window.typingTimeout)
    window.typingTimeout = setTimeout(() => {
      setTyping(false)
      socketRef.current.emit('typing', {
        room: roomName,
        user: userName,
        isTyping: false
      })
    }, 1000)
  }

  return (
    <div className="bg-white rounded-2xl shadow p-4 h-full flex flex-col">
      <h3 className="font-semibold mb-2">Chat with {mentorName}</h3>
      
      <div className="flex-1 overflow-y-auto mb-3 space-y-2 p-2 border rounded-lg">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-4 text-sm">
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.from === userName ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] p-2 rounded-lg text-sm ${
                  msg.from === userName
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="font-medium text-xs mb-1">
                  {msg.from === userName ? 'You' : msg.from}
                </div>
                <div>{msg.message}</div>
                {msg.timestamp && (
                  <div className="text-xs opacity-70 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-gray-100 p-2 rounded-lg text-sm">
              <span className="animate-pulse">Typing...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={handleTyping}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          Send
        </button>
      </div>
    </div>
  )
}

