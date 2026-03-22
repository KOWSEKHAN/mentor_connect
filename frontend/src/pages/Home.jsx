import { useState, useEffect } from 'react'
import Header from '../components/Header'
import Footer from '../components/Footer'
import { Link } from 'react-router-dom'

const HERO_IMAGES = ['/assets/hero1.jpg', '/assets/hero2.jpg', '/assets/hero3.jpg']
const ROTATE_INTERVAL_MS = 4000

export default function Home() {
  const [heroIndex, setHeroIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setHeroIndex((i) => (i + 1) % HERO_IMAGES.length)
    }, ROTATE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div>
      <Header />
      <main className="max-w-6xl mx-auto px-8 py-12">
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl font-bold text-white">
              MentorConnect — AI-Powered Mentorship
            </h1>
            <p className="mt-4 text-slate-400">
              Connect with mentors, get AI-generated learning paths, and track progress.
            </p>
            <div className="mt-6 flex gap-3">
              <Link
                to="/auth"
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all duration-200 hover:shadow-lg"
              >
                Join as Mentor / Mentee
              </Link>
            </div>
          </div>
          <div className="relative rounded-2xl overflow-hidden shadow-2xl aspect-[4/3] min-h-[240px] bg-slate-800">
            {HERO_IMAGES.map((src, i) => (
              <div
                key={src}
                className="absolute inset-0 transition-opacity duration-700 ease-in-out"
                style={{
                  opacity: heroIndex === i ? 1 : 0,
                  transform: heroIndex === i ? 'scale(1.02)' : 'scale(1)',
                  transition: 'opacity 700ms ease-in-out, transform 8s ease-out',
                }}
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    e.target.nextSibling?.classList.remove('hidden')
                  }}
                />
                <div
                  className="absolute inset-0 bg-gradient-to-br from-indigo-600/40 to-slate-900/80 hidden"
                  aria-hidden
                />
              </div>
            ))}
            <div
              className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 via-slate-800 to-slate-900 pointer-events-none"
              aria-hidden
            />
          </div>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-semibold text-white mb-6">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-slate-200 hover:scale-[1.02] transition duration-200">
              1. Sign up as Mentor or Mentee
            </div>
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-slate-200 hover:scale-[1.02] transition duration-200">
              2. Find mentors & request mentorship
            </div>
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-slate-200 hover:scale-[1.02] transition duration-200">
              3. Learn with AI content & chat
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
