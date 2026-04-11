import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ToastProvider } from './components/ui'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Learner from './pages/Learner'
import Portfolio from './pages/Portfolio'

// ─── Auth context ─────────────────────────────────────────────
const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [learner, setLearner] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) loadProfile(u.id)
      else { setProfile(null); setLearner(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    setLoading(true)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
    setProfile(prof)
    if (prof?.role === 'learner') {
      const { data: lrn } = await supabase.from('learners').select('*').eq('profile_id', userId).single()
      setLearner(lrn)
    }
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setProfile(null); setLearner(null)
  }

  return (
    <AuthCtx.Provider value={{ user, profile, learner, loading, signOut, refreshLearner: () => user && loadProfile(user.id) }}>
      {children}
    </AuthCtx.Provider>
  )
}

// ─── Route guards ──────────────────────────────────────────────
function Protected({ role, children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (role && profile?.role !== role) {
    return <Navigate to={profile?.role === 'admin' ? '/admin' : '/dashboard'} replace />
  }
  return children
}

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 28, color: 'var(--brand)', animation: 'spin 2s linear infinite' }}>✦</div>
      <p style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</p>
    </div>
  )
}

function AutoRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />
  return <Navigate to="/dashboard" replace />
}

// ─── App ───────────────────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login"           element={<Login />} />
            <Route path="/admin"           element={<Protected role="admin"><Admin /></Protected>} />
            <Route path="/dashboard"       element={<Protected role="learner"><Learner /></Protected>} />
            <Route path="/portfolio/:slug" element={<Portfolio />} />
            <Route path="*"               element={<AutoRedirect />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
