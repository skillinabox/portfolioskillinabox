import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'

export default function Login() {
  const nav = useNavigate()
  const [mode, setMode]       = useState(null)     // null | 'admin' | 'learner'
  const [isSignup, setSignup] = useState(false)
  const [email, setEmail]     = useState('')
  const [password, setPass]   = useState('')
  const [name, setName]       = useState('')
  const [err, setErr]         = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAuth(e) {
    e.preventDefault()
    setErr(''); setLoading(true)
    try {
      if (isSignup) {
        // Learner self-signup — email must already exist in learners table
        const { data: existing } = await supabase.from('learners').select('id').eq('email', email).maybeSingle()
        if (!existing) {
          setErr('This email is not registered. Ask your Skillinabox coordinator to add you first.')
          setLoading(false); return
        }
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
        if (error) throw error
        setErr(''); setLoading(false)
        // Show success — they may need to verify email depending on Supabase settings
        setMode('verify')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // Navigation handled by App auth state change
      }
    } catch (e) {
      setErr(e.message || 'Something went wrong')
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email) { setErr('Enter your email address first'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    setLoading(false)
    if (error) setErr(error.message)
    else setErr('Check your inbox for a password reset link.')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left: Brand panel */}
      <div style={{ width: '42%', background: 'linear-gradient(160deg, #8C3F57 0%, #B5637A 55%, #C8849A 100%)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '48px 44px', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .06, backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 64 }}>
            <span style={{ fontSize: 22, color: 'rgba(255,255,255,.9)' }}>✦</span>
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: '#fff', letterSpacing: '.01em' }}>Skillinabox</span>
          </div>
          <h1 style={{ fontSize: 40, color: '#fff', lineHeight: 1.18, marginBottom: 18 }}>
            Your fashion<br />portfolio,<br /><em>beautifully<br />showcased.</em>
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.7 }}>
            Upload your garments, get AI-powered imagery, and publish your brand to the world — all in one place.
          </p>
        </div>
        <div style={{ position: 'relative', display: 'flex', gap: 28 }}>
          {[['428+', 'Learner portfolios'], ['3,400+', 'Garments catalogued'], ['100%', 'Made with love']].map(([n, l]) => (
            <div key={l}>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff' }}>{n}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 3 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 40px', background: '#fff' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Mode verify success */}
          {mode === 'verify' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
              <h2 style={{ fontSize: 22, marginBottom: 8 }}>Check your inbox</h2>
              <p style={{ fontSize: 14, color: 'var(--gray-500)', lineHeight: 1.6, marginBottom: 24 }}>We've sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then come back to sign in.</p>
              <button className="btn btn-default" onClick={() => { setMode(null); setSignup(false) }}>Back to sign in</button>
            </div>
          )}

          {/* Role selector */}
          {!mode && (
            <>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, marginBottom: 6, fontWeight: 400 }}>Welcome back</h2>
              <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 32 }}>Sign in to your Skillinabox account</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  ['admin', 'Admin / Team login', 'Manage learners, upload garments, publish portfolios'],
                  ['learner', 'Learner login', 'View your garments, set pricing, track enquiries'],
                ].map(([r, title, sub]) => (
                  <button key={r} onClick={() => setMode(r)} style={{ padding: '18px 20px', background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-lg)', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.background = 'var(--brand-pale)' }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--gray-200)'; e.currentTarget.style.background = '#fff' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{sub}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Auth form */}
          {(mode === 'admin' || mode === 'learner') && (
            <>
              <button onClick={() => { setMode(null); setErr(''); setSignup(false) }} style={{ fontSize: 12, color: 'var(--gray-400)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 5, padding: 0 }}>← Back</button>

              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, marginBottom: 4, fontWeight: 400 }}>
                {isSignup ? 'Create account' : (mode === 'admin' ? 'Admin sign in' : 'Learner sign in')}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 28 }}>
                {isSignup ? 'Your email must be registered by your coordinator' : 'Enter your credentials to continue'}
              </p>

              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {isSignup && (
                  <div>
                    <label className="label">Full name</label>
                    <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required />
                  </div>
                )}
                <div>
                  <label className="label">Email address</label>
                  <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" value={password} onChange={e => setPass(e.target.value)} placeholder="••••••••" required minLength={6} />
                </div>

                {err && (
                  <div style={{ fontSize: 13, padding: '10px 12px', background: err.includes('Check your') ? 'var(--green-bg)' : 'var(--red-bg)', color: err.includes('Check your') ? 'var(--green-fg)' : 'var(--red-fg)', borderRadius: 'var(--radius-md)' }}>
                    {err}
                  </div>
                )}

                <button type="submit" className="btn btn-primary" disabled={loading} style={{ marginTop: 4, padding: '12px', fontSize: 14, borderRadius: 'var(--radius-md)', justifyContent: 'center', background: 'linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%)', border: 'none', boxShadow: '0 2px 8px rgba(140,63,87,.25)' }}>
                  {loading ? <Spinner size={16} color="#fff" /> : (isSignup ? 'Create account' : 'Sign in')}
                </button>

                {!isSignup && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <button type="button" onClick={handleForgotPassword} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 0 }}>Forgot password?</button>
                    {mode === 'learner' && (
                      <button type="button" onClick={() => { setSignup(true); setErr('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', padding: 0, fontWeight: 500 }}>New learner? Sign up</button>
                    )}
                  </div>
                )}
                {isSignup && (
                  <button type="button" onClick={() => { setSignup(false); setErr('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 13, padding: 0, textAlign: 'center' }}>Already have an account? Sign in</button>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
