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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Ignore token refreshes and initial session — only act on explicit sign in/out
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return
      const u = session?.user ?? null
      setUser(u)
      if (event === 'SIGNED_OUT') { setProfile(null); setLearner(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Single-session enforcement ────────────────────────────

  useEffect(() => {
    if (!user) return
    const check = async () => {
      const stored = localStorage.getItem('snb_session_token')
      if (!stored) return // no token stored (e.g. admin on trusted device)
      const { data } = await supabase.from('profiles').select('session_token').eq('id', user.id).single()
      if (data && data.session_token && data.session_token !== stored) {
        // Token mismatch — another device logged in
        localStorage.removeItem('snb_session_token')
        localStorage.setItem('snb_kicked', 'You were signed out because your account was accessed on another device.')
        await supabase.auth.signOut()
        window.location.replace('/login')
      }
    }
    check() // check immediately on mount
    const interval = setInterval(check, 30000) // then every 30s
    return () => clearInterval(interval)
  }, [user])

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
    // Clear session token from DB so other devices are also invalidated
    if (user) {
      await supabase.from('profiles').update({ session_token: null }).eq('id', user.id)
    }
    localStorage.removeItem('snb_session_token')
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

// Detect if running on a student subdomain e.g. arzu.houseofentreprenaari.com
function getSubdomainSlug() {
  const host = window.location.hostname
  const knownHosts = ['portfolioskillinabox.vercel.app', 'portfolio.skillinabox.in', 'localhost', '127.0.0.1']
  if (knownHosts.some(h => host === h || host.endsWith('.vercel.app'))) return null
  // Check for *.houseofentreprenaari.com or any custom wildcard
  const parts = host.split('.')
  if (parts.length >= 3) {
    // subdomain.domain.tld — return the subdomain as slug
    return parts[0]
  }
  return null
}

export default function App() {
  const subdomainSlug = getSubdomainSlug()

  // If on a student subdomain, render Portfolio directly
  if (subdomainSlug) {
    return (
      <BrowserRouter>
        <ToastProvider>
          <Routes>
            <Route path="*" element={<Portfolio subdomainSlug={subdomainSlug} />} />
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login"           element={<Login />} />
            <Route path="/admin"           element={<Protected role="admin"><Admin /></Protected>} />
            <Route path="/dashboard"       element={<Protected role="learner"><Learner /></Protected>} />
            <Route path="/portfolio/:slug" element={<Portfolio />} />
            <Route path="/portfolio/preview/:learnerId" element={<Portfolio />} />
            <Route path="*"               element={<AutoRedirect />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
