// src/pages/Auth.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const nav = useNavigate();

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
        if (user.role === 'mentor') nav('/mentor');
        else nav('/mentee');
      } else {
        const res = await api.post('/api/auth/login', { email, password });
        const { user, token } = res.data;
        login(user, token);
        if (user.role === 'mentor') nav('/mentor');
        else nav('/mentee');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Something went wrong');
    }
  }

  return (
    <>
      <Header />
      <main className="max-w-2xl mx-auto p-6">
        <h2 className="text-2xl font-semibold mb-4">{mode === 'signup' ? 'Create an account' : 'Sign in'}</h2>

        <div className="mb-4">
          <button onClick={() => setMode('signup')} className={'px-3 py-1 rounded ' + (mode === 'signup' ? 'bg-blue-600 text-white' : 'bg-gray-100')}>Sign up</button>
          <button onClick={() => setMode('login')} className={'px-3 py-1 rounded ml-2 ' + (mode === 'login' ? 'bg-blue-600 text-white' : 'bg-gray-100')}>Log in</button>
        </div>

        {error && <p className="text-red-600 mb-3 bg-red-100 p-2 rounded">{error}</p>}

        <form onSubmit={submit} className="space-y-4 bg-white rounded-xl p-6 shadow">
          {mode === 'signup' && (
            <>
              <div>
                <label className="block text-sm">Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 p-2 border rounded w-full">
                  <option value="mentee">Mentee</option>
                  <option value="mentor">Mentor</option>
                </select>
              </div>

              <div>
                <label className="block text-sm">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 p-2 border rounded w-full" required />
              </div>

              <div>
                <label className="block text-sm">Resume (Optional)</label>
                <input 
                  type="file" 
                  accept=".pdf,.docx,.txt" 
                  onChange={(e) => setResumeFile(e.target.files[0])}
                  className="mt-1 p-2 border rounded w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Upload .pdf, .docx, or .txt file. Keywords will be automatically extracted.</p>
              </div>

              <div>
                <label className="block text-sm">
                  {role === 'mentee' ? 'Interests' : 'Expertise'} (Optional - comma separated)
                </label>
                <input 
                  value={interests} 
                  onChange={(e) => setInterests(e.target.value)} 
                  placeholder={role === 'mentee' ? 'e.g., React, Node.js, MongoDB' : 'e.g., React, Node.js, MongoDB'}
                  className="mt-1 p-2 border rounded w-full"
                />
                <p className="text-xs text-gray-500 mt-1">Manually add keywords if not in resume, or to supplement resume keywords.</p>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1 p-2 border rounded w-full" required />
          </div>

          <div>
            <label className="block text-sm">Password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="mt-1 p-2 border rounded w-full" required />
          </div>

          <div className="flex justify-end">
            <button className="px-4 py-2 bg-blue-600 text-white rounded">{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          </div>
        </form>
      </main>
      <Footer />
    </>
  );
}
