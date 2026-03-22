import { useState } from 'react'
import api from '../../../utils/api'
import { showToast } from '../../../components/Toast'

export default function AIChatBot({ course }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    
    // Add user message
    const newMessages = [...messages, { from: 'user', text: userMessage }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await api.post('/api/ai/chat', {
        message: userMessage,
        courseId: course._id,
        context: { domain: course.domain, title: course.title }
      })
      
      setMessages([...newMessages, { from: 'ai', text: res.data.response }])
    } catch (err) {
      console.error('Failed to get AI response:', err)
      showToast('Failed to get AI response', 'error')
      setMessages([...newMessages, { from: 'ai', text: 'Sorry, I encountered an error. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-slate-800/80 backdrop-blur border border-slate-700 rounded-2xl p-6 h-full flex flex-col shadow-xl">
      <h3 className="text-xl font-semibold mb-4 text-white">Ask AI</h3>

      <div className="flex-1 overflow-y-auto mb-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            Ask me anything about your course! I can help with study tips, roadmap guidance, and more.
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                  msg.from === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-700 text-white'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-700 text-slate-300 px-4 py-2 rounded-2xl flex items-center gap-1">
              <span>AI is typing</span>
              <span className="flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question..."
          className="flex-1 p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          disabled={loading}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 hover:shadow-indigo-500/20 disabled:opacity-50 transition-all"
        >
          Send
        </button>
      </div>
    </div>
  )
}

