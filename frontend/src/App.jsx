import { Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import MentorDashboard from "./pages/mentor/MentorDashboard";
import MentorWorkspace from "./pages/mentor/MentorWorkspace";
import MentorProfile from "./pages/mentor/Profile";
import MenteeDashboard from "./pages/mentee/MenteeDashboard";
import MenteeProfile from "./pages/mentee/Profile";
import CourseWorkspace from "./pages/mentee/CourseWorkspace";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./utils/auth";

function Protected({ children, role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/mentor"
          element={
            <Protected role="mentor">
              <MentorDashboard />
            </Protected>
          }
        />
        <Route
          path="/mentor/workspace/:menteeId"
          element={
            <Protected role="mentor">
              <MentorWorkspace />
            </Protected>
          }
        />
        <Route
          path="/mentor/profile"
          element={
            <Protected role="mentor">
              <MentorProfile />
            </Protected>
          }
        />
        <Route
          path="/mentee"
          element={
            <Protected role="mentee">
              <MenteeDashboard />
            </Protected>
          }
        />
        <Route
          path="/mentee/profile"
          element={
            <Protected role="mentee">
              <MenteeProfile />
            </Protected>
          }
        />
        <Route
          path="/mentee/course/:courseId"
          element={
            <Protected role="mentee">
              <CourseWorkspace />
            </Protected>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
