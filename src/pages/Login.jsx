import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { SIBLogo, Spinner } from '../components/ui'

export default function Login() {
  const [mode, setMode]     = useState(null)
  const [signup, setSignup] = useState(false)
  const [email, setEmail]   = useState('')
  const [pass, setPass]     = useState('')
  const [name, setName]     = useState('')
  const [err, setErr]       = useState('')
  const [info, setInfo]     = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const msg = localStorage.getItem('snb_kicked')
    if (msg) { setErr(msg); localStorage.removeItem('snb_kicked') }
  }, [])

  async function handleAuth(e) {
    e.preventDefault()
    setErr(''); setInfo(''); setLoading(true)
    try {
      if (signup) {
        const { data: existing } = await supabase.from('learners').select('id').eq('email', email).maybeSingle()
        if (!existing) { setErr('This email is not registered. Ask your Skillinabox coordinator to add you first.'); setLoading(false); return }
        const { error } = await supabase.auth.signUp({ email, password: pass, options: { data: { name } } })
        if (error) throw error
        setInfo('Account created! You can now sign in.')
        setSignup(false)
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
        if (error) throw error
        const sessionToken = crypto.randomUUID()
        await supabase.from('profiles').update({ session_token: sessionToken }).eq('id', data.user.id)
        localStorage.setItem('snb_session_token', sessionToken)
        window.location.replace(mode === 'admin' ? '/admin' : '/dashboard')
        return
      }
    } catch(e) { setErr(e.message || 'Something went wrong') }
    finally { setLoading(false) }
  }

  async function handleForgot() {
    if (!email) { setErr('Enter your email address first'); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` })
    setLoading(false)
    if (error) setErr(error.message)
    else setInfo('Check your inbox for a password reset link.')
  }

  const inp = {
    width:'100%', padding:'14px 16px', fontSize:16, border:'1px solid rgba(255,255,255,.15)',
    borderRadius:12, background:'rgba(255,255,255,.08)', color:'#fff', outline:'none',
    marginBottom:14, transition:'border-color .15s, background .15s', fontFamily:'inherit',
    WebkitAppearance:'none',
  }

  return (
    <div className="login-page" style={{ minHeight:'100dvh', background:'#0D0D0D', display:'flex', flexDirection:'column', fontFamily:"'DM Sans',sans-serif", position:'relative', overflow:'hidden' }}>

      {/* Background design */}
      <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(244,98,42,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(244,98,42,.06) 1px,transparent 1px)', backgroundSize:'44px 44px', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', top:'-10%', right:'-10%', width:'60vw', height:'60vw', maxWidth:500, maxHeight:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(244,98,42,.12) 0%,transparent 65%)', pointerEvents:'none' }}/>
      <div style={{ position:'absolute', bottom:'-5%', left:'-5%', width:'40vw', height:'40vw', maxWidth:360, maxHeight:360, borderRadius:'50%', background:'radial-gradient(circle,rgba(90,50,200,.08) 0%,transparent 65%)', pointerEvents:'none' }}/>

      {/* Top bar */}
      <div className="login-topbar" style={{ position:'relative', padding:'20px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <SIBLogo dark={true}/>
        <div className="login-tag" style={{ fontSize:11, color:'#444', letterSpacing:'.1em', textTransform:'uppercase' }}>Portfolio Platform</div>
      </div>

      {/* Main content */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px 24px 48px', position:'relative' }}>

        {!mode ? (
          // ── Role selector ──
          <div style={{ width:'100%', maxWidth:400, animation:'fadeUp .4s ease both' }}>
            <div style={{ textAlign:'center', marginBottom:36 }}>
              <h1 className="login-heading" style={{ fontFamily:"'DM Serif Display',serif", fontSize:38, color:'#fff', lineHeight:1.15, marginBottom:10 }}>
                Welcome back
              </h1>
              <p style={{ fontSize:14, color:'#666', lineHeight:1.7 }}>Sign in to your portfolio platform</p>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[
                ['admin',   '⚙',  'Team & admin login',   'Manage learners, upload garments, publish portfolios', '#F4622A'],
                ['learner', '👗', 'Learner login',         'View garments, set pricing, publish your portfolio',    '#A78BFA'],
              ].map(([r, icon, title, sub, accent]) => (
                <button key={r} onClick={()=>setMode(r)} className="login-role-card"
                  style={{ padding:'20px 22px', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', borderRadius:16, cursor:'pointer', textAlign:'left', transition:'all .2s', fontFamily:'inherit', backdropFilter:'blur(8px)' }}
                  onMouseOver={e=>{ e.currentTarget.style.background='rgba(255,255,255,.1)'; e.currentTarget.style.borderColor=accent+'66'; e.currentTarget.style.transform='translateY(-2px)' }}
                  onMouseOut={e=>{ e.currentTarget.style.background='rgba(255,255,255,.05)'; e.currentTarget.style.borderColor='rgba(255,255,255,.1)'; e.currentTarget.style.transform='' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
                    <span style={{ fontSize:20 }}>{icon}</span>
                    <span style={{ fontSize:15, fontWeight:600, color:'#fff' }}>{title}</span>
                    <span style={{ marginLeft:'auto', fontSize:16, color:'#444' }}>›</span>
                  </div>
                  <div style={{ fontSize:12, color:'#555', lineHeight:1.6, paddingLeft:32 }}>{sub}</div>
                </button>
              ))}
            </div>

            <div style={{ marginTop:32, textAlign:'center', fontSize:12, color:'#333' }}>
              A <span style={{ color:'#F4622A', fontWeight:500 }}>Skillinabox</span> initiative
            </div>

            {/* Stats strip */}
            <div className="login-stats-strip" style={{ marginTop:40, display:'flex', justifyContent:'center', gap:32 }}>
              {[['428+','Portfolios'],['3,400+','Garments'],['100%','Made with ♥']].map(([n,l])=>(
                <div key={l} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>{n}</div>
                  <div style={{ fontSize:10, color:'#444', marginTop:2 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

        ) : (
          // ── Auth form ──
          <div style={{ width:'100%', maxWidth:400, animation:'fadeUp .3s ease both' }}>
            <button onClick={()=>{setMode(null);setErr('');setInfo('');setSignup(false)}}
              style={{ fontSize:13, color:'#666', background:'none', border:'none', cursor:'pointer', marginBottom:28, display:'flex', alignItems:'center', gap:6, padding:0, fontFamily:'inherit' }}>
              ← Back
            </button>

            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'#F4622A', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:8 }}>
                {mode === 'admin' ? '⚙ Team & Admin' : '👗 Learner'}
              </div>
              <h2 className="login-heading-sm" style={{ fontFamily:"'DM Serif Display',serif", fontSize:32, color:'#fff', fontWeight:400, marginBottom:6 }}>
                {signup ? 'Create account' : 'Sign in'}
              </h2>
              <p style={{ fontSize:13, color:'#555' }}>
                {signup ? 'Your email must be registered by your coordinator' : 'Enter your credentials to continue'}
              </p>
            </div>

            <form onSubmit={handleAuth}>
              {signup && (
                <div style={{ marginBottom:4 }}>
                  <label style={{ display:'block', fontSize:11, color:'#666', marginBottom:6, letterSpacing:'.05em' }}>Full name</label>
                  <input style={inp} type="text" value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" required
                    onFocus={e=>{ e.target.style.borderColor='#F4622A'; e.target.style.background='rgba(255,255,255,.12)' }}
                    onBlur={e=>{ e.target.style.borderColor='rgba(255,255,255,.15)'; e.target.style.background='rgba(255,255,255,.08)' }}/>
                </div>
              )}
              <div style={{ marginBottom:4 }}>
                <label style={{ display:'block', fontSize:11, color:'#666', marginBottom:6, letterSpacing:'.05em' }}>Email address</label>
                <input style={inp} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required
                  onFocus={e=>{ e.target.style.borderColor='#F4622A'; e.target.style.background='rgba(255,255,255,.12)' }}
                  onBlur={e=>{ e.target.style.borderColor='rgba(255,255,255,.15)'; e.target.style.background='rgba(255,255,255,.08)' }}/>
              </div>
              <div style={{ marginBottom:8 }}>
                <label style={{ display:'block', fontSize:11, color:'#666', marginBottom:6, letterSpacing:'.05em' }}>Password</label>
                <input style={inp} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" required minLength={6}
                  onFocus={e=>{ e.target.style.borderColor='#F4622A'; e.target.style.background='rgba(255,255,255,.12)' }}
                  onBlur={e=>{ e.target.style.borderColor='rgba(255,255,255,.15)'; e.target.style.background='rgba(255,255,255,.08)' }}/>
              </div>

              {err  && <div style={{ fontSize:13, padding:'10px 12px', background:'rgba(153,27,27,.3)', color:'#FCA5A5', borderRadius:8, marginBottom:14, border:'1px solid rgba(153,27,27,.4)' }}>{err}</div>}
              {info && <div style={{ fontSize:13, padding:'10px 12px', background:'rgba(13,107,58,.3)', color:'#6EE7B7', borderRadius:8, marginBottom:14, border:'1px solid rgba(13,107,58,.4)' }}>{info}</div>}

              <button type="submit" disabled={loading}
                style={{ width:'100%', padding:'15px', fontSize:15, fontWeight:600, borderRadius:12, cursor:'pointer', border:'none', background:'#F4622A', color:'#fff', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:loading?.7:1, transition:'all .15s', boxShadow:'0 4px 20px rgba(244,98,42,.35)' }}>
                {loading ? <Spinner size={16} color="#fff"/> : (signup ? 'Create account →' : 'Sign in →')}
              </button>

              <div style={{ display:'flex', justifyContent:'space-between', marginTop:16, fontSize:13 }}>
                {!signup && <button type="button" onClick={handleForgot} style={{ background:'none', border:'none', cursor:'pointer', color:'#555', padding:0, fontFamily:'inherit' }}>Forgot password?</button>}
                {mode==='learner' && (
                  <button type="button" onClick={()=>{setSignup(s=>!s);setErr('');setInfo('')}}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'#F4622A', padding:0, fontWeight:500, fontFamily:'inherit', marginLeft:'auto' }}>
                    {signup ? 'Sign in instead' : 'New? Sign up →'}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
