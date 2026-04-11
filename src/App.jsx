import { createContext, useContext, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { ToastProvider, SIBLogo, Spinner } from './components/ui'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Learner from './pages/Learner'
import Portfolio from './pages/Portfolio'
import './index.css'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [learner, setLearner] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) loadProfile(u.id)
      else setLoading(false)
    })

    // Listen for changes
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
    try {
      // Try to get profile
      let { data: prof, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      // If no profile exists, create one (handles case where trigger didn't fire)
      if (error || !prof) {
        const { data: newProf } = await supabase
          .from('profiles')
          .insert({ id: userId, role: 'learner' })
          .select()
          .single()
        prof = newProf
      }

      setProfile(prof)

      // If learner, fetch their record
      if (prof?.role === 'learner') {
        const { data: lrn } = await supabase
          .from('learners')
          .select('*')
          .eq('profile_id', userId)
          .maybeSingle()
        setLearner(lrn || null)
      }
    } catch (err) {
      console.error('loadProfile error:', err)
      // Set a fallback profile so we don't loop forever
      setProfile({ id: userId, role: 'learner' })
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null); setProfile(null); setLearner(null)
  }

  return (
    <AuthCtx.Provider value={{ user, profile, learner, loading, signOut, refreshProfile: () => user && loadProfile(user.id) }}>
      {children}
    </AuthCtx.Provider>
  )
}

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
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', gap:16, background:'var(--dark)' }}>
      <SIBLogo dark={true} />
      <Spinner size={24} color="#F4622A" />
    </div>
  )
}

function AutoRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={profile?.role === 'admin' ? '/admin' : '/dashboard'} replace />
}

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
