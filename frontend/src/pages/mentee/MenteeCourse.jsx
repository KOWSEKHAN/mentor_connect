import { useState } from 'react'
export default function MenteeCourse({ course }){
  const [messages, setMessages] = useState([
    { from:'mentee', text:'I have a doubt on module 2' },
    { from:'mentor', text:'Explain the issue' }
  ])
  const [text, setText] = useState('')
  function send(){
    if(!text) return
    setMessages(m=>[...m,{ from:'mentee', text }])
    setText('')
  }
  return (
    <div className="bg-white p-4 rounded-2xl shadow">
      <h3 className="font-semibold">Course Workspace (placeholder)</h3>
      <div className="mt-4 grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="p-3 border rounded h-60 overflow-auto">
            <h4 className="font-medium">AI-generated learning content</h4>
            <p className="text-sm text-gray-600 mt-2">[Placeholder for AI content that mentor can view]</p>

            <h4 className="font-medium mt-4">AI-generated roadmap & progress</h4>
            <p className="text-sm text-gray-600 mt-2">Progress: 40%</p>
          </div>

          <div className="mt-3">
            <div className="h-48 overflow-auto p-2 border rounded">
              {messages.map((m,i)=>(
                <div key={i} className={'my-2 '+(m.from==='mentee'?'text-right':'text-left')}>
                  <div className={'inline-block p-2 rounded '+(m.from==='mentee'?'bg-gray-200':'bg-blue-600 text-white')}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input value={text} onChange={e=>setText(e.target.value)} placeholder="Message mentor" className="flex-1 p-2 border rounded"/>
              <button onClick={send} className="px-3 py-2 bg-blue-600 text-white rounded">Send</button>
            </div>
          </div>
        </div>

        <div>
          <div className="p-3 border rounded">
            <h4 className="font-semibold">Notes</h4>
            <p className="text-sm text-gray-600 mt-2">Take notes here (placeholder)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
