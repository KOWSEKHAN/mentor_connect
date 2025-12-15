import { useState } from 'react'
export default function MentorChat({ mentee }){
  const [messages, setMessages] = useState([
    { from:'mentee', text:'Hi mentor!' },
    { from:'mentor', text:'Hello — how can I help?' }
  ])
  const [text, setText] = useState('')
  function send(){
    if(!text) return
    setMessages(m=>[...m,{ from:'mentor', text }])
    setText('')
  }
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <div className="bg-white p-4 rounded-2xl shadow">
          <h4 className="font-semibold">Chat with {mentee.name}</h4>
          <div className="h-64 overflow-auto mt-4 p-2 border rounded">
            {messages.map((m,i)=>(
              <div key={i} className={'my-2 '+(m.from==='mentor'?'text-right':'text-left')}>
                <div className={'inline-block p-2 rounded '+(m.from==='mentor'?'bg-blue-600 text-white':'bg-gray-200')}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={text} onChange={e=>setText(e.target.value)} placeholder="Type a message" className="flex-1 p-2 border rounded"/>
            <button onClick={send} className="px-3 py-2 bg-blue-600 text-white rounded">Send</button>
          </div>
        </div>
      </div>
      <div>
        <div className="bg-white p-4 rounded-2xl shadow">
          <h4 className="font-semibold">Progress</h4>
          <div className="mt-3">
            <div className="text-sm text-gray-600">Completion: 10%</div>
            <div className="w-full bg-gray-100 rounded h-3 mt-2">
              <div className="bg-blue-600 h-3 rounded" style={{width:'10%'}}></div>
            </div>
            <div className="mt-4 text-sm text-gray-500">AI Roadmap & Content accessible here (placeholder)</div>
          </div>
        </div>
      </div>
    </div>
  )
}
