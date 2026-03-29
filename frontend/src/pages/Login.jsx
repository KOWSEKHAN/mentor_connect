import { useState } from "react";
import { useAuth } from "../utils/auth";
import api from "../utils/api";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [form, setForm] = useState({
    email: "",
    password: ""
  });

  const [error, setError] = useState("");

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await api.post("/api/auth/login", form);

      login(res.data.user, res.data.token);

      if(res.data.user.role === "mentor") navigate("/mentor");
      else if(res.data.user.role === "mentee") navigate("/mentee");
      else navigate("/");

    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Try again.");
    }
  };

  return (
    <div className="auth-page">
      <h2>Login</h2>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSubmit} className="auth-form">
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

        <button type="submit">Login</button>

        <p>
          Don’t have an account? <Link to="/auth?type=signup">Signup</Link>
        </p>
      </form>
    </div>
  );
}
