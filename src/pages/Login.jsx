import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { SIBLogo, Spinner } from '../components/ui'

export default function Login() {
  const [mode, setMode]     = useState(null)  // null | 'admin' | 'learner'
  const [signup, setSignup] = useState(false)
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [name, setName]     = useState('')
  const [err, setErr]       = useState('')
  const [info, setInfo]     = useState('')
  const [loading, setLoading] = useState(false)

  async function handleAuth(e) {
    e.preventDefault()
    setErr(''); setInfo(''); setLoading(true)
    try {
      if (signup) {
        // Check email is pre-registered
        const { data: existing } = await supabase.from('learners').select('id').eq('email', email).maybeSingle()
        if (!existing) {
          setErr('This email is not registered. Ask your Skillinabox coordinator to add you first.')
          setLoading(false); return
        }
        const { error } = await supabase.auth.signUp({ email, password: pass, options: { data: { name } } })
        if (error) throw error
        setInfo('Account created! You can now sign in.')
        setSignup(false)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
        // Navigation handled by auth state change in App.jsx
      }
    } catch(e) {
      setErr(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot() {
    if (!email) { setErr('Enter your email address first'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`
    })
    setLoading(false)
    if (error) setErr(error.message)
    else setInfo('Check your inbox for a password reset link.')
  }

  const inputStyle = { width:'100%', padding:'12px 14px', fontSize:14, border:'1px solid #333', borderRadius:10, background:'#1A1A1A', color:'#fff', outline:'none', marginBottom:12, transition:'border-color .15s', fontFamily:'inherit' }

  return (
    <div style={{ display:'flex', minHeight:'100vh', fontFamily:"'DM Sans',sans-serif" }}>
      {/* Left: Brand panel */}
      <div style={{ width:'45%', background:'#111', display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'48px 44px', position:'relative', overflow:'hidden', flexShrink:0 }}>
        {/* Grid pattern */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(244,98,42,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(244,98,42,.08) 1px, transparent 1px)', backgroundSize:'48px 48px' }} />
        {/* Decorative elements */}
        <div style={{ position:'absolute', top:80, right:60, width:120, height:120, borderRadius:'50%', border:'1px solid rgba(244,98,42,.15)' }} />
        <div style={{ position:'absolute', bottom:140, left:40, width:60, height:60, border:'1px solid rgba(244,98,42,.1)', transform:'rotate(45deg)' }} />

        <div style={{ position:'relative' }}>
          <div style={{ marginBottom:64 }}><SIBLogo dark={true} /></div>
          <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:46, color:'#fff', lineHeight:1.15, marginBottom:16 }}>
            Showcase.<br/><em style={{ color:'var(--orange)' }}>Sell.</em><br/>Succeed.
          </h1>
          <p style={{ fontSize:14, color:'#777', lineHeight:1.8, maxWidth:320 }}>
            The official portfolio platform for Skillinabox graduates. Upload your garments, get AI-powered imagery, and publish your brand to the world.
          </p>
        </div>

        <div style={{ position:'relative' }}>
          <div style={{ fontSize:11, color:'#444', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:16 }}>An initiative of Skillinabox</div>
          <div style={{ display:'flex', gap:32 }}>
            {[['428+','Portfolios'],['3,400+','Garments'],['100%','Made with ♥']].map(([n,l])=>(
              <div key={l}>
                <div style={{ fontSize:20, fontWeight:600, color:'#fff' }}>{n}</div>
                <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Form */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'48px 40px', background:'#F7F6F4' }}>
        <div style={{ width:'100%', maxWidth:380 }}>

          {/* Role selector */}
          {!mode && (
            <div className="anim-in">
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:30, fontWeight:400, color:'#111', marginBottom:6 }}>Welcome back</h2>
              <p style={{ fontSize:14, color:'#888', marginBottom:32 }}>Sign in to your portfolio platform</p>
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  ['admin',   'Team & admin login',   'Manage learners, upload garments, publish portfolios'],
                  ['learner', 'Learner login',         'View garments, set pricing, track enquiries'],
                ].map(([r,title,sub])=>(
                  <button key={r} onClick={()=>setMode(r)} style={{ padding:'18px 20px', background:'#fff', border:'1px solid #E2E0DC', borderRadius:12, cursor:'pointer', textAlign:'left', transition:'all .15s', fontFamily:'inherit' }}
                    onMouseOver={e=>{e.currentTarget.style.borderColor='#F4622A';e.currentTarget.style.background='#FEF0EA'}}
                    onMouseOut={e=>{e.currentTarget.style.borderColor='#E2E0DC';e.currentTarget.style.background='#fff'}}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111', marginBottom:4 }}>{title}</div>
                    <div style={{ fontSize:12, color:'#999' }}>{sub}</div>
                  </button>
                ))}
              </div>
              <div style={{ marginTop:28, textAlign:'center', fontSize:12, color:'#bbb' }}>
                A <span style={{ color:'#F4622A', fontWeight:500 }}>Skillinabox</span> initiative
              </div>
            </div>
          )}

          {/* Auth form */}
          {mode && (
            <div className="anim-in">
              <button onClick={()=>{setMode(null);setErr('');setInfo('');setSignup(false)}} style={{ fontSize:12, color:'#999', background:'none', border:'none', cursor:'pointer', marginBottom:28, display:'flex', alignItems:'center', gap:5, padding:0, fontFamily:'inherit' }}>← Back</button>
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, fontWeight:400, color:'#111', marginBottom:4 }}>
                {signup ? 'Create account' : mode==='admin' ? 'Admin sign in' : 'Learner sign in'}
              </h2>
              <p style={{ fontSize:13, color:'#999', marginBottom:28 }}>
                {signup ? 'Your email must be registered by your coordinator' : 'Enter your credentials to continue'}
              </p>

              <form onSubmit={handleAuth}>
                {signup && (
                  <div style={{ marginBottom:12 }}>
                    <label className="label">Full name</label>
                    <input style={inputStyle} type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" required
                      onFocus={e=>e.target.style.borderColor='#F4622A'} onBlur={e=>e.target.style.borderColor='#333'} />
                  </div>
                )}
                <div style={{ marginBottom:12 }}>
                  <label className="label">Email address</label>
                  <input style={inputStyle} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required
                    onFocus={e=>e.target.style.borderColor='#F4622A'} onBlur={e=>e.target.style.borderColor='#333'} />
                </div>
                <div style={{ marginBottom:16 }}>
                  <label className="label">Password</label>
                  <input style={inputStyle} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" required minLength={6}
                    onFocus={e=>e.target.style.borderColor='#F4622A'} onBlur={e=>e.target.style.borderColor='#333'} />
                </div>

                {err  && <div style={{ fontSize:13, padding:'10px 12px', background:'#FEE2E2', color:'#991B1B', borderRadius:8, marginBottom:12 }}>{err}</div>}
                {info && <div style={{ fontSize:13, padding:'10px 12px', background:'#E6F4EC', color:'#0D6B3A', borderRadius:8, marginBottom:12 }}>{info}</div>}

                <button type="submit" disabled={loading} style={{ width:'100%', padding:'13px', fontSize:14, fontWeight:600, borderRadius:10, cursor:'pointer', border:'none', background:'#F4622A', color:'#fff', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:loading?.7:1, transition:'opacity .15s' }}>
                  {loading ? <Spinner size={16} color="#fff" /> : (signup ? 'Create account' : 'Sign in')}
                </button>

                <div style={{ display:'flex', justifyContent:'space-between', marginTop:14, fontSize:13 }}>
                  {!signup && <button type="button" onClick={handleForgot} style={{ background:'none', border:'none', cursor:'pointer', color:'#999', padding:0, fontFamily:'inherit' }}>Forgot password?</button>}
                  {mode==='learner' && (
                    <button type="button" onClick={()=>{setSignup(s=>!s);setErr('');setInfo('')}} style={{ background:'none', border:'none', cursor:'pointer', color:'#F4622A', padding:0, fontWeight:500, fontFamily:'inherit', marginLeft:'auto' }}>
                      {signup ? 'Sign in instead' : 'New? Sign up →'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
