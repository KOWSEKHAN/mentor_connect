import Header from '../components/Header'
import Footer from '../components/Footer'
import { Link } from 'react-router-dom'

export default function Home(){
  return (
    <div>
      <Header/>
      <main className="max-w-6xl mx-auto px-4 py-12">
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl font-bold">MentorConnect — AI-Powered Mentorship</h1>
            <p className="mt-4 text-gray-600">Connect with mentors, get AI-generated learning paths, and track progress.</p>
            <div className="mt-6 space-x-3">
              <Link to="/auth" className="px-5 py-3 bg-blue-600 text-white rounded-lg">Join as Mentor / Mentee</Link>
            </div>
          </div>
          <div>
            <div className="bg-gradient-to-tr from-blue-400 to-indigo-500 rounded-2xl h-64 flex items-center justify-center text-white">
              <div className="p-6">Hero illustration placeholder</div>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-2xl font-semibold">How it works</h2>
          <div className="mt-6 grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl shadow p-4">1. Sign up as Mentor or Mentee</div>
            <div className="bg-white rounded-xl shadow p-4">2. Find mentors & request mentorship</div>
            <div className="bg-white rounded-xl shadow p-4">3. Learn with AI content & chat</div>
          </div>
        </section>
      </main>
      <Footer/>
    </div>
  )
}
