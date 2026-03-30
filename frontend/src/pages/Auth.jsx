// src/pages/Auth.jsx
import { useState } from 'react';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useAuth } from '../utils/auth';
import api from '../utils/api';

export default function Auth() {
  const [mode, setMode] = useState('signup'); // 'signup' | 'login'
  const [role, setRole] = useState('mentee');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resumeFile, setResumeFile] = useState(null);
  const [interests, setInterests] = useState('');
  const [error, setError] = useState('');

  const { login } = useAuth();

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'signup') {
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('password', password);
        formData.append('role', role);
        if (resumeFile) {
          formData.append('resume', resumeFile);
        }
        if (interests.trim()) {
          formData.append('interests', interests);
        }

        const res = await api.post('/api/auth/signup', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
        // response contains: { message, user, token }
        const { user, token } = res.data;
        login(user, token);
      } else {
        const res = await api.post('/api/auth/login', { email, password });
        const { user, token } = res.data;
        login(user, token);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Something went wrong');
    }
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto px-8 py-8">
        <h2 className="text-2xl font-semibold text-white mb-4">{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>

        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setMode('signup')}
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${mode === 'signup' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
          >
            Sign up
          </button>
          <button
            onClick={() => setMode('login')}
            className={`px-4 py-2 rounded-lg transition-all duration-200 ${mode === 'login' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'}`}
          >
            Log in
          </button>
        </div>

        {error && (
          <p className="text-red-400 mb-4 bg-red-500/10 border border-red-500/30 p-3 rounded-xl text-sm">
            {error}
          </p>
        )}

        <form
          onSubmit={submit}
          className="space-y-6 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl p-8"
        >
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-sm text-slate-300 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="mentee">Mentee</option>
                  <option value="mentor">Mentor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Resume (Optional)</label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={(e) => setResumeFile(e.target.files[0])}
                  className="w-full mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:bg-indigo-600 file:text-white file:text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Upload .pdf, .docx, or .txt file. Keywords will be automatically extracted.</p>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">
                  {role === 'mentee' ? 'Interests' : 'Expertise'} (Optional - comma separated)
                </label>
                <input
                  value={interests}
                  onChange={(e) => setInterests(e.target.value)}
                  placeholder={role === 'mentee' ? 'e.g., React, Node.js, MongoDB' : 'e.g., React, Node.js, MongoDB'}
                  className="w-full mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-xs text-slate-500 mt-1">Manually add keywords if not in resume, or to supplement resume keywords.</p>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-slate-300 mb-1">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              className="w-full mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-slate-300 mb-1">Password</label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full mt-1 p-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all duration-200 hover:shadow-lg"
            >
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          </div>
        </form>
      </main>
      <Footer />
    </>
  );
}
