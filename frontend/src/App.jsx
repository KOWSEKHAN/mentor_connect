import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import MentorDashboard from "./pages/mentor/MentorDashboard";
import MentorWorkspace from "./pages/mentor/MentorWorkspace";
import MentorProfile from "./pages/mentor/Profile";
import MenteeDashboard from "./pages/mentee/MenteeDashboard";
import MenteeProfile from "./pages/mentee/Profile";
import CourseWorkspace from "./pages/mentee/CourseWorkspace";
import CommunityChat from "./pages/community/CommunityChat";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "./utils/auth";
import { CommunityUnreadProvider } from "./context/CommunityUnreadContext";

function LoadingScreen() {
  return <div className="flex items-center justify-center min-h-screen bg-slate-950 text-slate-400">Loading...</div>;
}

function ProtectedRoute({ children, role }) {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (!user) return <Navigate to="/auth" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <LoadingScreen />;
  if (user) {
    return <Navigate to={user.role === 'mentor' ? '/mentor' : '/mentee'} replace />;
  }
  return children;
}

function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}

function RootRoute() {
  const { user, ready } = useAuth();
  const location = useLocation();
  console.log('Route decision:', { user: user?._id || user?.id || null, ready, pathname: location.pathname });

  if (!ready) return <LoadingScreen />;
  if (user) {
    return <Navigate to={user.role === 'mentor' ? '/mentor' : '/mentee'} replace />;
  }
  return <Home />;
}

function App() {
  return (
    <AuthProvider>
      <CommunityUnreadProvider>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900">
          <Routes>
            <Route
              path="/"
              element={
                <PageTransition>
                  <RootRoute />
                </PageTransition>
              }
            />
            <Route
              path="/auth"
              element={
                <PageTransition>
                  <PublicRoute>
                    <Auth />
                  </PublicRoute>
                </PageTransition>
              }
            />
            <Route
              path="/mentor"
              element={
                <PageTransition>
                  <ProtectedRoute role="mentor">
                    <MentorDashboard />
                  </ProtectedRoute>
                </PageTransition>
              }
            />
            <Route
              path="/mentor/workspace/:mentorshipId"
              element={
                <PageTransition>
                  <ProtectedRoute role="mentor">
                    <MentorWorkspace />
                  </ProtectedRoute>
                </PageTransition>
              }
            />
            <Route
              path="/mentor/profile"
              element={
                <PageTransition>
                  <ProtectedRoute role="mentor">
                    <MentorProfile />
                  </ProtectedRoute>
                </PageTransition>
              }
            />
            <Route
              path="/mentee"
              element={
                <PageTransition>
                  <ProtectedRoute role="mentee">
                    <MenteeDashboard />
                  </ProtectedRoute>
                </PageTransition>
              }
            />
            <Route
              path="/mentee/profile"
              element={
                <PageTransition>
                  <ProtectedRoute role="mentee">
                    <MenteeProfile />
                  </ProtectedRoute>
                </PageTransition>
              }
            />
            <Route
              path="/mentee/course/:courseId"
              element={
                <PageTransition>
                  <ProtectedRoute role="mentee">
                    <CourseWorkspace />
                  </ProtectedRoute>
                </PageTransition>
              }
            />
            <Route
              path="/community"
              element={
                <PageTransition>
                  <ProtectedRoute>
                    <CommunityChat />
                  </ProtectedRoute>
                </PageTransition>
              }
            />
            <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
          </Routes>
        </div>
      </CommunityUnreadProvider>
    </AuthProvider>
  );
}

export default App;
