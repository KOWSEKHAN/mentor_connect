import { useState } from "react";
import { useAuth } from "../utils/auth";
import api from "../utils/api";
import { Link } from "react-router-dom";

export default function Signup() {
  const { login } = useAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "mentor"
  });

  const [error, setError] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [interestInput, setInterestInput] = useState("");
  const [interests, setInterests] = useState([]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setResumeFile(file || null);
  };

  const handleInterestInputKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const value = interestInput.trim();
      if (value && !interests.includes(value)) {
        setInterests([...interests, value]);
      }
      setInterestInput("");
    }
  };

  const removeInterest = (value) => {
    setInterests(interests.filter((i) => i !== value));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const formData = new FormData();
      formData.append("name", form.name);
      formData.append("email", form.email);
      formData.append("password", form.password);
      formData.append("role", form.role);
      if (resumeFile) {
        formData.append("resume", resumeFile);
      }
      if (interests.length > 0) {
        formData.append("interests", interests.join(","));
      }

      const res = await api.post("/api/auth/signup", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      login(res.data.user, res.data.token);

    } catch (err) {
      setError(err.response?.data?.message || "Signup failed. Try again.");
    }
  };

  return (
    <div className="auth-page">
      <h2>Create Account</h2>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="auth-form">

        <input
          type="text"
          name="name"
          placeholder="Full Name"
          onChange={handleChange}
          value={form.name}
          required
        />

        <input
          type="email"
          name="email"
          placeholder="Email"
          onChange={handleChange}
          value={form.email}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password"
          onChange={handleChange}
          value={form.password}
          required
        />

        {/* Role Selection */}
        <select name="role" value={form.role} onChange={handleChange}>
          <option value="mentor">Mentor</option>
          <option value="mentee">Mentee</option>
        </select>

        {/* Resume upload (optional) */}
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">
            Upload Resume (optional)
          </label>
          <input
            type="file"
            accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
            onChange={handleFileChange}
          />
        </div>

        {/* Interest chips input */}
        <div className="mt-4">
          <label className="block text-sm font-medium mb-1">
            Interests (press Enter or comma to add)
          </label>
          <input
            type="text"
            value={interestInput}
            onChange={(e) => setInterestInput(e.target.value)}
            onKeyDown={handleInterestInputKeyDown}
            placeholder="e.g. React, Data Science, UX Design"
          />
          {interests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span
                  key={interest}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-gray-200 text-sm"
                >
                  {interest}
                  <button
                    type="button"
                    onClick={() => removeInterest(interest)}
                    className="ml-2 text-xs text-gray-600"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <button type="submit">Signup</button>

        <p>
          Already have an account? <Link to="/auth?type=login">Login</Link>
        </p>

      </form>
    </div>
  );
}
