import { useState, useEffect } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'
import { THEMES, DEFAULT_THEME } from '../lib/themes'

const MEASUREMENTS = ['Bust','Waist','Hips','Shoulder','Sleeve length','Front length','Back length','Inseam','Thigh','Calf']

export default function Portfolio({ subdomainSlug }) {
  const { slug: routeSlug, learnerId } = useParams()
  const slug = subdomainSlug || routeSlug
  const location = useLocation()
  const isPreview = !!learnerId || location.pathname.includes('/preview/')
  const [lightbox,   setLightbox]   = useState(null)
  const [learner,    setLearner]    = useState(null)
  const [garments,   setGarments]   = useState([])
  const [colls,      setColls]      = useState([])
  const [reviews,    setReviews]    = useState([])
  const [certs,      setCerts]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [enquiry,    setEnquiry]    = useState(null) // garment or 'general'
  const [step,       setStep]       = useState(1)    // 1=form, 2=measurements, 3=done
  const [wantsMeas,  setWantsMeas]  = useState(null) // true/false/null
  const [form,       setForm]       = useState({ name:'', email:'', phone:'', size:'', message:'' })
  const [meas,       setMeas]       = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [activeNav,  setActiveNav]  = useState('home')
  const [mobileNav,  setMobileNav]   = useState(false)

  useEffect(() => {
    async function load() {
      // Preview mode — load by learnerId regardless of published status
      let l
      if (learnerId) {
        const { data } = await supabase.from('learners').select('*').eq('id', learnerId).single()
        l = data
      } else {
        const { data } = await supabase.from('learners').select('*').eq('slug', slug).eq('status', 'published').single()
        l = data
      }
      if (!l) { setLoading(false); return }
      const [{ data:g }, { data:c }, { data:r }, { data:cr }] = await Promise.all([
        supabase.from('garments').select('*').eq('learner_id',l.id).eq('status','published').order('created_at'),
        supabase.from('collections').select('*').eq('learner_id',l.id).order('display_order'),
        supabase.from('reviews').select('*').eq('learner_id',l.id).eq('approved',true).order('created_at',{ascending:false}),
        supabase.from('certificates').select('*').eq('learner_id',l.id).order('display_order'),
      ])
      setLearner(l); setGarments(g||[]); setColls(c||[]); setReviews(r||[]); setCerts(cr||[]); setLoading(false)
    }
    load()
  }, [slug])

  useEffect(() => {
    if (!lightbox) return
    const fn = e => {
      if (e.key==='ArrowRight') setLightbox(p=>({...p,index:(p.index+1)%p.images.length}))
      if (e.key==='ArrowLeft')  setLightbox(p=>({...p,index:(p.index-1+p.images.length)%p.images.length}))
      if (e.key==='Escape')     setLightbox(null)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [lightbox])

  useEffect(() => {
    const fn = () => {
      for (const id of ['home','collection','about','expertise','contact'].reverse()) {
        const el = document.getElementById(id)
        if (el && window.scrollY >= el.offsetTop - 120) { setActiveNav(id); break }
      }
    }
    window.addEventListener('scroll', fn)
    return () => window.removeEventListener('scroll', fn)
  }, [])

  function openEnquiry(g) {
    setEnquiry(g)
    setStep(1); setWantsMeas(null); setMeas({})
    setForm({ name:'', email:'', phone:'', size:'', message: g?.id ? `Hi, I'm interested in the ${g.name}. ` : '' })
  }

  async function submitEnquiry(e) {
    e.preventDefault()
    // If step 1 and haven't asked about measurements yet, ask
    if (step===1 && enquiry?.id) { setStep(2); return }
    setSubmitting(true)
    await supabase.from('enquiries').insert({
      learner_id:   learner.id,
      from_name:    form.name,
      from_email:   form.email,
      from_phone:   form.phone,
      type:         enquiry?.id ? 'order' : 'enquiry',
      garment_name: enquiry?.name || null,
      size:         form.size || null,
      message:      form.message,
      measurements: wantsMeas && Object.keys(meas).length ? meas : null,
    })
    setSubmitting(false); setStep(3)
    setTimeout(() => { setEnquiry(null); setStep(1); setWantsMeas(null); setMeas({}) }, 2500)
  }

  function scrollTo(id) { document.getElementById(id)?.scrollIntoView({ behavior:'smooth' }) }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0A0A0A', flexDirection:'column', gap:16 }}>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:'#fff' }}>Skillinabox</div>
      <Spinner size={24} color="#F4622A"/>
    </div>
  )
  if (!learner) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, background:'#0A0A0A', padding:24 }}>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, color:'#fff' }}>Portfolio not found</div>
      <p style={{ fontSize:14, color:'#666' }}>This portfolio doesn't exist or hasn't been published yet.</p>
    </div>
  )

  // Group garments by collection
  const byCol = colls.reduce((acc,c) => {
    acc[c.id] = { col:c, items: garments.filter(g=>g.collection_id===c.id) }
    return acc
  }, {})
  const ungrouped = garments.filter(g=>!g.collection_id)
  const allSections = [...colls.map(c=>byCol[c.id]).filter(x=>x.items.length), ...(ungrouped.length?[{ col:{id:'__main',name:'Collection', description:''}, items:ungrouped }]:[])]

  const skills    = learner.skills    ? learner.skills.split(',').map(s=>s.trim()).filter(Boolean) : []
  const expertise = learner.expertise ? learner.expertise.split(',').map(s=>s.trim()).filter(Boolean) : []
  // Apply theme from learner settings — with fallback
  const themeKey = (learner.theme && THEMES[learner.theme]) ? learner.theme : DEFAULT_THEME
  const theme = THEMES[themeKey]
  const T = theme.colors
  const G = T.accent

  const NAV = ['home','collection','about','expertise','reviews','contact']

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", minHeight:'100vh' }}>
      {/* Theme CSS variables — injected separately to allow dynamic values */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --accent: ${T.accent};
          --accent-dark: ${T.accentDark};
          --hero-bg: ${T.heroBg};
          --card-bg: ${T.cardBg};
          --card-border: ${T.cardBorder};
          --text-primary: ${T.textPrimary};
          --text-muted: ${T.textMuted};
          --page-bg: ${T.bg};
        }
        body { background: ${T.bg}; }
      `}}/>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=Playfair+Display:ital@0;1&display=swap');
        *{box-sizing:border-box;margin:0;padding:0} html{scroll-behavior:smooth}
        .nl{padding:6px 0;font-size:13px;color:#777;cursor:pointer;border:none;border-bottom:2px solid transparent;background:none;font-family:inherit;transition:all .2s;text-transform:capitalize}
        .nl:hover,.nl.on{color:#fff;border-bottom-color:#F4622A}
        .gc{background:var(--card-bg,#fff);border-radius:16px;overflow:hidden;border:1px solid var(--card-border,#E8E6E2);transition:transform .25s,box-shadow .25s;cursor:pointer;position:relative}
        .gc:hover{transform:translateY(-6px);box-shadow:0 16px 48px rgba(0,0,0,.12)}
        .gc:hover .go{opacity:1;transform:translateY(0)}
        .go{position:absolute;bottom:16px;left:16px;right:16px;background:#F4622A;color:#fff;padding:10px;border-radius:8px;font-size:13px;font-weight:600;text-align:center;opacity:0;transform:translateY(8px);transition:all .25s}
        .ec{background:var(--card-bg,#fff);border:1px solid var(--card-border,#E8E6E2);border-radius:14px;padding:28px 24px;transition:all .25s}
        .ec:hover{border-color:#F4622A;transform:translateY(-2px)}
        .inf{width:100%;padding:12px 14px;font-size:15px;border:1px solid #E2E0DC;border-radius:10px;outline:none;transition:border-color .15s;font-family:inherit}
        .inf:focus{border-color:#F4622A}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .6s ease both}
        @media (max-width: 768px) {
          .pf-section { padding: 56px 18px !important; }
          .lb-stage { padding: 48px 16px !important; }
          .inf { font-size: 16px !important; padding: 13px 14px !important; }
        }
      `}</style>

      {/* PREVIEW BANNER */}
      {isPreview && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:200, background:'#5B21B6', padding:'8px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#fff', letterSpacing:'.08em', textTransform:'uppercase', background:'rgba(255,255,255,.2)', padding:'2px 8px', borderRadius:99 }}>Preview</span>
            <span style={{ fontSize:13, color:'rgba(255,255,255,.8)' }}>This is how your portfolio looks to customers — not publicly visible yet</span>
          </div>
          <button onClick={()=>window.close()} style={{ fontSize:12, color:'rgba(255,255,255,.7)', background:'none', border:'1px solid rgba(255,255,255,.3)', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontFamily:'inherit' }}>Close preview ×</button>
        </div>
      )}

      {/* NAV */}
      <nav style={{ position:'fixed', top: isPreview ? 37 : 0, left:0, right:0, zIndex:100, background: T.heroBg==='#0D0D0D' ? 'rgba(13,13,13,.97)' : T.heroBg==='#000000' ? 'rgba(0,0,0,.97)' : T.heroBg==='#081C15' ? 'rgba(8,28,21,.97)' : 'rgba(10,10,10,.95)', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:58 }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {learner.logo_url ? (
              <>
                <img src={learner.logo_url} alt="logo" style={{ height:38, maxWidth:120, objectFit:'contain' }}/>
                <div style={{ width:1, height:24, background:'rgba(255,255,255,.1)' }}/>
              </>
            ) : null}
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:2.5 }}>
                <div style={{ width:18, height:2.5, borderRadius:2, background:'#00B4D8' }}/>
                <div style={{ display:'flex', gap:2 }}><div style={{ width:4, height:2.5, borderRadius:2, background:'#F4A61A' }}/><div style={{ width:14, height:2.5, borderRadius:2, background:'#777' }}/></div>
                <div style={{ width:18, height:2.5, borderRadius:2, background:G }}/>
              </div>
              <div>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:15, color:'#fff', lineHeight:1.1 }}>{learner.brand||learner.name}</div>
                <div style={{ fontSize:9, color:'#444', letterSpacing:'.07em', marginTop:2 }}>A SKILLINABOX INITIATIVE</div>
              </div>
            </div>
          </div>
          <div className="portfolio-nav-links" style={{ display:'flex', gap:24, alignItems:'center' }}>
            {NAV.map(n=><button key={n} className={`nl ${activeNav===n?'on':''}`} onClick={()=>scrollTo(n)}>{n.charAt(0).toUpperCase()+n.slice(1)}</button>)}
            <button onClick={()=>openEnquiry('general')} className="portfolio-nav-cta" style={{ padding:'9px 20px', fontSize:13, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit', marginLeft:8 }}>Get in touch</button>
            {/* Mobile hamburger */}
            <button className="portfolio-mobile-menu-btn" onClick={()=>setMobileNav(o=>!o)}
              style={{ display:'none', flexDirection:'column', gap:4, background:'rgba(255,255,255,.1)', border:'none', borderRadius:7, padding:'8px', cursor:'pointer', marginLeft:8 }}>
              <span style={{ width:16, height:2, background:'#fff', borderRadius:2, display:'block' }}/>
              <span style={{ width:16, height:2, background:'#fff', borderRadius:2, display:'block' }}/>
              <span style={{ width:16, height:2, background:'#fff', borderRadius:2, display:'block' }}/>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile nav dropdown */}
      {mobileNav && (
        <div style={{ position:'fixed', top: isPreview ? 37+58 : 58, left:0, right:0, background:'rgba(10,10,10,.98)', zIndex:90, padding:'16px 24px', display:'flex', flexDirection:'column', gap:0, borderBottom:'1px solid rgba(255,255,255,.1)' }}>
          {NAV.map(n=>(
            <button key={n} onClick={()=>{ scrollTo(n); setMobileNav(false) }}
              style={{ padding:'14px 0', fontSize:15, color:'#ddd', background:'none', border:'none', borderBottom:'1px solid rgba(255,255,255,.07)', cursor:'pointer', fontFamily:'inherit', textAlign:'left', textTransform:'capitalize' }}>
              {n.charAt(0).toUpperCase()+n.slice(1)}
            </button>
          ))}
          <button onClick={()=>{ openEnquiry('general'); setMobileNav(false) }}
            style={{ marginTop:14, padding:'14px', fontSize:14, fontWeight:600, background:G, border:'none', borderRadius:10, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
            Get in touch →
          </button>
        </div>
      )}

      {/* HERO */}
      <section id="home" style={{ minHeight:'100vh', background:T.heroBg, display:'flex', alignItems:'center', paddingTop: isPreview ? 95 : 58, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(244,98,42,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,98,42,.05) 1px,transparent 1px)`, backgroundSize:'56px 56px' }}/>
        <div style={{ position:'absolute', top:'15%', right:'8%', width:500, height:500, borderRadius:'50%', background:`radial-gradient(circle,rgba(244,98,42,.1) 0%,transparent 65%)`, pointerEvents:'none' }}/>

        <div style={{ maxWidth:1100, margin:'0 auto', padding:'80px 24px', position:'relative', width:'100%' }}>
          <div className="hero-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:72, alignItems:'center' }}>
            <div className="fu">
              <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.14em', textTransform:'uppercase', marginBottom:20 }}>Skillinabox Graduate · Fashion Designer</div>
              <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:'clamp(36px,5.5vw,68px)', color:'#fff', lineHeight:1.08, marginBottom:20 }}>{learner.brand||learner.name}</h1>
              {learner.tagline&&<p style={{ fontSize:17, color:'#666', lineHeight:1.8, marginBottom:36, maxWidth:460 }}>{learner.tagline}</p>}
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <button onClick={()=>scrollTo('collection')} style={{ padding:'14px 30px', fontSize:14, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 20px rgba(244,98,42,.3)` }}>View collection</button>
                <button onClick={()=>scrollTo('about')} style={{ padding:'14px 30px', fontSize:14, fontWeight:500, background:'transparent', color:'#ccc', border:'1px solid rgba(255,255,255,.15)', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>About me</button>
              </div>
              <div style={{ display:'flex', gap:40, marginTop:56, paddingTop:40, borderTop:'1px solid rgba(255,255,255,.07)' }}>
                {[[garments.length,'Pieces'],[allSections.length,'Collections'],[learner.years_exp||'New','Years exp.']].map(([v,l])=>(
                  <div key={l}>
                    <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:30, color:'#fff' }}>{v}</div>
                    <div style={{ fontSize:12, color:'#555', marginTop:4 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Garment stack */}
            <div className="hero-stack" style={{ position:'relative', height:520 }}>
              {garments.slice(0,3).map((g,i)=>(
                <div key={g.id} style={{ position:'absolute', width:i===0?'78%':i===1?'62%':'52%', top:`${i*8}%`, right:`${i*-5}%`, borderRadius:16, overflow:'hidden', boxShadow:`0 ${24-i*6}px ${80-i*20}px rgba(0,0,0,.${5+i})`, border:'1px solid rgba(255,255,255,.07)', transform:`rotate(${i*2.5}deg)`, zIndex:3-i }}>
                  <div style={{ paddingBottom:'125%', position:'relative', background:'#1A1A1A' }}>
                    {g.image_url ? <img src={g.image_url} alt={g.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:56, color:G }}>{g.name?.[0]||'?'}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* COLLECTION */}
      <section id="collection" className="pf-section" style={{ padding:'96px 24px', background:T.bg }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:56, flexWrap:'wrap', gap:16 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Portfolio</div>
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:44, color:'#111', lineHeight:1.15 }}>The Collection</h2>
            </div>
            <div style={{ fontSize:14, color:'#888' }}>{garments.length} piece{garments.length!==1?'s':''}</div>
          </div>

          {allSections.map(({ col, items })=>(
            <div key={col.id} style={{ marginBottom:72 }}>
              <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:16 }}>
                <h3 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, color:'#111', whiteSpace:'nowrap' }}>{col.name}</h3>
                <div style={{ flex:1, height:1, background:'#E2E0DC' }}/>
                <span style={{ fontSize:13, color:'#aaa', whiteSpace:'nowrap' }}>{items.length} piece{items.length!==1?'s':''}</span>
              </div>
              {col.description&&<p style={{ fontSize:14, color:'#777', lineHeight:1.7, marginBottom:24, maxWidth:600, fontStyle:'italic' }}>{col.description}</p>}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:24 }}>
                {items.map(g=>{
                  const ALL_POSE_KEYS = ['front','back','left','right','walking','sitting','closeup','outdoor','side'] // 'side' for legacy
                  const poseUrls = g.poses ? ALL_POSE_KEYS.filter(k=>g.poses[k]).map(k=>g.poses[k]) : []
                  const ownPhotoUrls = (g.own_photos||[]).map(p=>p.url).filter(Boolean)
                  const allImgs = [g.image_url, ...poseUrls, ...ownPhotoUrls].filter(Boolean)
                  return (
                  <div key={g.id} className="gc">
                    <div onClick={()=>allImgs.length>0&&setLightbox({ images:allImgs, index:0 })}
                      style={{ position:'relative', paddingBottom:'118%', background:'#F0EDEA', cursor: allImgs.length>0?'pointer':'default' }}>
                      {g.image_url ? <img src={g.image_url} alt={g.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:60, color:'#D0CBC4' }}>{g.name?.[0]||'?'}</div>}
                      {allImgs.length > 1 && <div style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.55)', color:'#fff', fontSize:11, fontWeight:600, padding:'3px 9px', borderRadius:99 }}>1/{allImgs.length} ↗</div>}
                      <div className="go">View all photos →</div>
                    </div>
                    <div style={{ padding:'18px 20px 22px' }}>
                      <div style={{ fontSize:15, fontWeight:600, color:'#111', marginBottom:5, lineHeight:1.3 }}>{g.name}</div>
                      {(g.fabric||g.colour)&&<div style={{ fontSize:13, color:'#888', marginBottom:10 }}>{[g.fabric,g.colour].filter(Boolean).join(' · ')}</div>}
                      {g.description&&<div style={{ fontSize:13, color:'#666', lineHeight:1.65, marginBottom:14 }}>{g.description}</div>}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ fontSize:20, fontWeight:700, color:g.price&&Number(g.price)>0?'#C94E1E':'#999' }}>
                          {g.price&&Number(g.price)>0?`₹${Number(g.price).toLocaleString('en-IN')}`:'Price on request'}
                        </div>
                        <span style={{ fontSize:11, color:'#888', background:'#F0EDEA', padding:'4px 12px', borderRadius:99 }}>{g.availability||'Made to order'}</span>
                      </div>
                      {g.occasion&&<div style={{ fontSize:12, color:'#bbb', marginTop:8 }}>For: {g.occasion}</div>}
                      {(() => {
                        const ALL_POSE_KEYS = ['front','back','left','right','walking','sitting','closeup','outdoor','side']
                        const poseImgs = g.poses ? ALL_POSE_KEYS.filter(k=>g.poses[k]).map(k=>({ key:k, url:g.poses[k] })) : []
                        const ownImgs  = (g.own_photos||[]).filter(p=>p.url).map(p=>({ key:`own-${p.url}`, url:p.url, caption:p.caption }))
                        const allThumbImgs = [...poseImgs, ...ownImgs]
                        const allImgsLocal = [g.image_url, ...poseImgs.map(p=>p.url), ...ownImgs.map(p=>p.url)].filter(Boolean)
                        if (allThumbImgs.length === 0) return null
                        return (
                          <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #F0EEE9' }}>
                            <div style={{ fontSize:11, color:'#aaa', marginBottom:6 }}>Photos · <span style={{ color:G }}>tap to view</span></div>
                            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                              {allThumbImgs.map((p, i) => (
                                <div key={p.key} onClick={e=>{e.stopPropagation();setLightbox({ images:allImgsLocal, index:i+1 })}}
                                  style={{ width:'calc(25% - 4px)', borderRadius:7, overflow:'hidden', aspectRatio:'3/4', cursor:'pointer', position:'relative', flexShrink:0 }}>
                                  <img src={p.url} alt={p.caption||p.key} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                      <button onClick={e=>{e.stopPropagation();openEnquiry(g)}}
                        style={{ marginTop:14, width:'100%', padding:'11px', fontSize:13, fontWeight:600, background:'#F4622A', border:'none', borderRadius:9, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                        Enquire about this piece →
                      </button>
                    </div>
                  </div>
                )})}
              </div>
            </div>
          ))}
          {garments.length===0&&<div style={{ textAlign:'center', padding:'80px 24px', color:'#aaa' }}><div style={{ fontSize:40, marginBottom:12, opacity:.3 }}>✦</div><div style={{ fontSize:16 }}>Collection coming soon</div></div>}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="pf-section" style={{ padding:'96px 24px', background:T.heroBg, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(244,98,42,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(244,98,42,.04) 1px,transparent 1px)`, backgroundSize:'48px 48px' }}/>
        <div style={{ maxWidth:1100, margin:'0 auto', position:'relative' }}>
          <div className="about-grid" style={{ display:'grid', gridTemplateColumns:'5fr 6fr', gap:80, alignItems:'center' }}>
            <div>
              <div style={{ aspectRatio:'3/4', borderRadius:20, overflow:'hidden', background:'#1A1A1A', border:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                {learner.photo_url
                  ? <img src={learner.photo_url} alt={learner.name} style={{ width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0 }}/>
                  : <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:100, color:`rgba(244,98,42,.12)`, lineHeight:1, userSelect:'none' }}>
                      {learner.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
                    </div>}
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,.75) 0%,transparent 50%)', pointerEvents:'none' }}/>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:24 }}>
                  <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:'#fff', marginBottom:4 }}>{learner.name}</div>
                  <div style={{ fontSize:13, color:'#888' }}>{learner.speciality||'Fashion Designer · Skillinabox Graduate'}</div>
                  {learner.location&&<div style={{ fontSize:12, color:'#555', marginTop:4 }}>📍 {learner.location}</div>}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:16 }}>About the designer</div>
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:40, color:'#fff', lineHeight:1.2, marginBottom:24 }}>The story behind the brand</h2>
              <p style={{ fontSize:15, color:'#666', lineHeight:1.9, marginBottom:32 }}>
                {learner.bio||`${learner.name} is a passionate fashion designer and proud graduate of the Skillinabox Fashion Design Programme. With a deep love for craftsmanship and an eye for detail, ${learner.name.split(' ')[0]} creates garments that celebrate the richness of Indian textiles while embracing contemporary design sensibilities.`}
              </p>
              <div className="about-meta-grid" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:36 }}>
                {[['Location',learner.location||'India'],['Speciality',learner.speciality||'Fashion Design'],['Training','Skillinabox Programme'],['Collections',`${allSections.length} published`]].map(([l,v])=>(
                  <div key={l} style={{ padding:'14px 16px', background:'rgba(255,255,255,.04)', borderRadius:10, border:'1px solid rgba(255,255,255,.05)' }}>
                    <div style={{ fontSize:11, color:'#444', marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:14, fontWeight:500, color:'#bbb' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <button onClick={()=>openEnquiry('general')} style={{ padding:'12px 24px', fontSize:13, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:9, cursor:'pointer', fontFamily:'inherit' }}>Commission a piece</button>
                {learner.instagram&&<a href={`https://instagram.com/${learner.instagram.replace('@','')}`} target="_blank" rel="noreferrer" style={{ padding:'12px 24px', fontSize:13, fontWeight:500, background:'transparent', color:'#bbb', border:'1px solid rgba(255,255,255,.12)', borderRadius:9, textDecoration:'none', display:'inline-flex', alignItems:'center' }}>Instagram ↗</a>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EXPERTISE */}
      <section id="expertise" className="pf-section" style={{ padding:'96px 24px', background:T.bg }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:60 }}>
            <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Skills & expertise</div>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:44, color:'#111', marginBottom:16 }}>What I bring to the table</h2>
          </div>
          {skills.length>0&&(
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:56 }}>
              {skills.map((s,i)=>{
                const cols=[['#FEF0EA','#C94E1E'],['#E6F4EC','#0D6B3A'],['#F0EFFE','#5B21B6'],['#FEF3E2','#92400E'],['#EFF6FF','#1D4ED8'],['#FDF4FF','#7E22CE']]
                const [bg,fg]=cols[i%6]
                return <span key={s} style={{ display:'inline-block', padding:'7px 18px', borderRadius:99, fontSize:13, fontWeight:500, border:'1px solid', background:bg, color:fg, borderColor:fg+'40' }}>{s}</span>
              })}
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:20, marginBottom:56 }}>
            {(expertise.length>0
              ? expertise.map((ex,i)=>[['✦','◈','⟡','◎','⬡','⊕'][i%6],ex,''])
              : [['✦','Garment Construction','Expert knowledge of fabric handling, cutting and finishing.'],['◈','Design Thinking','Translating ideas into wearable, market-ready fashion pieces.'],['⟡','Indian Textiles','Deep understanding of traditional Indian fabrics and embroidery.'],['◎','Pattern Making','Drafting and modifying patterns for a perfect fit across sizes.']]
            ).map(([icon,title,desc])=>(
              <div key={title} className="ec">
                <div style={{ fontSize:22, color:G, marginBottom:14 }}>{icon}</div>
                <div style={{ fontSize:15, fontWeight:600, color:'#111', marginBottom:8 }}>{title}</div>
                {desc&&<div style={{ fontSize:13, color:'#888', lineHeight:1.65 }}>{desc}</div>}
              </div>
            ))}
          </div>
          <div className="expertise-banner" style={{ padding:'32px 40px', background:'#111', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'space-between', gap:24, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:10, color:'#444', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:8 }}>Trained & certified at</div>
              <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:'#fff', marginBottom:4 }}>Skillinabox Fashion Design Programme</div>
              <div style={{ fontSize:13, color:'#555' }}>India's leading skilling platform for women in fashion</div>
            </div>
            <div style={{ display:'flex', gap:28 }}>
              {[['NID','Certified'],['NSDC','Certified'],['Govt.','Recognised']].map(([l,s])=>(
                <div key={l} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:20, fontWeight:700, color:G, fontFamily:"'DM Serif Display',serif" }}>{l}</div>
                  <div style={{ fontSize:10, color:'#444', marginTop:3 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CERTIFICATES */}
      {certs.length > 0 && (
        <section className="pf-section" style={{ padding:'72px 24px', background:'#F7F6F4' }}>
          <div style={{ maxWidth:1100, margin:'0 auto' }}>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Qualifications</div>
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:40, color:'#111' }}>Certificates & credentials</h2>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:20 }}>
              {certs.map((cert, i) => (
                <div key={cert.id} onClick={()=>cert.image_url&&setLightbox({ images:[cert.image_url], index:0 })}
                  style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:'1px solid #E8E6E2', cursor:cert.image_url?'pointer':'default', transition:'transform .2s, box-shadow .2s' }}
                  onMouseOver={e=>{ if(cert.image_url){ e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.boxShadow='0 12px 32px rgba(0,0,0,.1)' }}}
                  onMouseOut={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow='' }}>
                  {cert.image_url ? (
                    <div style={{ position:'relative', paddingBottom:'70%', background:'#F0EDEA', overflow:'hidden' }}>
                      <img src={cert.image_url} alt={cert.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
                      <div style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.5)', color:'#fff', fontSize:10, padding:'3px 8px', borderRadius:99 }}>View ↗</div>
                    </div>
                  ) : (
                    <div style={{ paddingBottom:'70%', position:'relative', background:`linear-gradient(135deg,#FEF0EA,#F7F6F4)` }}>
                      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:48, opacity:.25 }}>📜</div>
                    </div>
                  )}
                  <div style={{ padding:'16px 18px' }}>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111', marginBottom:4 }}>{cert.name}</div>
                    <div style={{ fontSize:12, color:'#888' }}>{cert.issuer}</div>
                    {cert.issued_on && <div style={{ fontSize:11, color:'#bbb', marginTop:4 }}>{cert.issued_on}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      <section id="reviews" className="pf-section" style={{ padding:'96px 24px', background:T.heroBg }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:56 }}>
            <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>What customers say</div>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:44, color:'#fff', marginBottom:16 }}>Reviews</h2>
          </div>

          {/* Existing reviews */}
          {reviews.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:20, marginBottom:56 }}>
              {reviews.map(r=>(
                <div key={r.id} style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', borderRadius:14, padding:'24px 22px' }}>
                  <div style={{ display:'flex', gap:2, marginBottom:12 }}>
                    {[1,2,3,4,5].map(s=>(
                      <span key={s} style={{ fontSize:16, color: s<=r.rating ? G : '#333' }}>★</span>
                    ))}
                  </div>
                  <p style={{ fontSize:14, color:'#888', lineHeight:1.75, marginBottom:16, fontStyle:'italic' }}>"{r.text}"</p>
                  <div style={{ fontSize:13, fontWeight:500, color:'#ddd' }}>— {r.reviewer}</div>
                </div>
              ))}
            </div>
          )}

          {/* Leave a review form */}
          <ReviewForm learnerId={learner.id} onSubmitted={()=>{}} G={G}/>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="pf-section" style={{ padding:'96px 24px', background:T.heroBg }}>
        <div style={{ maxWidth:760, margin:'0 auto', textAlign:'center' }}>
          <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:16 }}>Let's work together</div>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:52, color:'#fff', lineHeight:1.15, marginBottom:16 }}>Interested in a piece?</h2>
          <p style={{ fontSize:16, color:'#555', lineHeight:1.8, maxWidth:460, margin:'0 auto 52px' }}>Whether you want to place an order, discuss a custom design, or simply learn more — I'd love to hear from you.</p>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:48 }}>
            {[learner.phone&&{label:'WhatsApp',value:learner.phone,href:`https://wa.me/${learner.phone.replace(/\D/g,'')}`,color:'#25D366'},
              learner.email&&{label:'Email',value:learner.email,href:`mailto:${learner.email}`,color:G},
              learner.instagram&&{label:'Instagram',value:learner.instagram,href:`https://instagram.com/${learner.instagram.replace('@','')}`,color:'#E1306C'}].filter(Boolean).map(item=>(
              <a key={item.label} href={item.href} target="_blank" rel="noreferrer" style={{ padding:'24px 20px', background:'rgba(255,255,255,.04)', borderRadius:14, border:'1px solid rgba(255,255,255,.06)', textDecoration:'none', display:'block' }}>
                <div style={{ fontSize:11, color:'#444', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:8 }}>{item.label}</div>
                <div style={{ fontSize:13, fontWeight:500, color:item.color, wordBreak:'break-all' }}>{item.value}</div>
              </a>
            ))}
          </div>
          <button onClick={()=>openEnquiry('general')} style={{ padding:'16px 44px', fontSize:15, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 24px rgba(244,98,42,.35)` }}>Send a message →</button>
        </div>
      </section>

      {/* FOOTER */}
      <div style={{ padding:'20px 24px', background:T.heroBg, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:12, color:'#2A2A2A' }}>© {new Date().getFullYear()} {learner.brand||learner.name} · Portfolio by <span style={{ color:G }}>Skillinabox</span></div>
        <div style={{ display:'flex', gap:20 }}>
          {NAV.map(n=><button key={n} onClick={()=>scrollTo(n)} style={{ fontSize:12, color:'#2A2A2A', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>{n}</button>)}
        </div>
      </div>

      {/* IMAGE LIGHTBOX */}
      {lightbox && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.95)', zIndex:300, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}
          onClick={e=>e.target===e.currentTarget&&setLightbox(null)}>
          <style>{`@keyframes fadeIn{from{opacity:0}to{opacity:1}}.lb-img{animation:fadeIn .2s ease}`}</style>

          {/* Close */}
          <button onClick={()=>setLightbox(null)} style={{ position:'absolute', top:20, right:24, background:'rgba(255,255,255,.1)', border:'none', color:'#fff', fontSize:24, width:44, height:44, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>

          {/* Counter */}
          <div style={{ position:'absolute', top:24, left:'50%', transform:'translateX(-50%)', fontSize:13, color:'rgba(255,255,255,.5)' }}>
            {lightbox.index + 1} / {lightbox.images.length}
          </div>

          {/* Main image */}
          <div className="lb-stage" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', width:'100%', padding:'60px 80px', minHeight:0 }}
            onTouchStart={e=>{ window.__lbTouchX = e.touches[0].clientX }}
            onTouchEnd={e=>{
              const dx = e.changedTouches[0].clientX - (window.__lbTouchX||0)
              if (Math.abs(dx) < 40 || lightbox.images.length<=1) return
              if (dx < 0) setLightbox(p=>({...p, index:(p.index+1)%p.images.length}))
              else        setLightbox(p=>({...p, index:(p.index-1+p.images.length)%p.images.length}))
            }}>
            <img key={lightbox.index} src={lightbox.images[lightbox.index]} alt="" className="lb-img"
              style={{ maxHeight:'100%', maxWidth:'100%', objectFit:'contain', borderRadius:12, boxShadow:'0 24px 80px rgba(0,0,0,.8)' }}/>
          </div>

          {/* Prev / Next arrows */}
          {lightbox.images.length > 1 && <>
            <button onClick={()=>setLightbox(p=>({...p, index:(p.index-1+p.images.length)%p.images.length}))}
              style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,.1)', border:'none', color:'#fff', fontSize:28, width:52, height:52, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)', transition:'background .15s' }}
              onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,.2)'}
              onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}>‹</button>
            <button onClick={()=>setLightbox(p=>({...p, index:(p.index+1)%p.images.length}))}
              style={{ position:'absolute', right:16, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,.1)', border:'none', color:'#fff', fontSize:28, width:52, height:52, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)', transition:'background .15s' }}
              onMouseOver={e=>e.currentTarget.style.background='rgba(255,255,255,.2)'}
              onMouseOut={e=>e.currentTarget.style.background='rgba(255,255,255,.1)'}>›</button>
          </>}

          {/* Thumbnail strip */}
          <div style={{ display:'flex', gap:8, padding:'0 24px 24px', flexShrink:0 }}>
            {lightbox.images.map((url, i) => (
              <div key={i} onClick={()=>setLightbox(p=>({...p, index:i}))}
                style={{ width:56, height:72, borderRadius:7, overflow:'hidden', cursor:'pointer', opacity: i===lightbox.index?1:.45, border: i===lightbox.index?'2px solid #F4622A':'2px solid transparent', transition:'all .15s', flexShrink:0 }}>
                <img src={url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ENQUIRY MODAL */}
      {enquiry && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={e=>e.target===e.currentTarget&&setEnquiry(null)}>
          <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth: step===2?560:480, padding:32, boxShadow:'0 40px 100px rgba(0,0,0,.4)', maxHeight:'90vh', overflowY:'auto' }}>

            {step===3 ? (
              <div style={{ textAlign:'center', padding:'32px 0' }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:'#E6F4EC', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 16px', color:'#0D6B3A' }}>✓</div>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, marginBottom:8 }}>Message sent!</div>
                <div style={{ fontSize:14, color:'#888' }}>{learner.name} will get back to you shortly.</div>
              </div>

            ) : step===2 ? (
              // Step 2: Ask about measurements
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
                  <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:'#111' }}>Would you like to share your measurements?</div>
                  <button onClick={()=>setEnquiry(null)} style={{ background:'none', border:'none', fontSize:26, cursor:'pointer', color:'#ccc', lineHeight:1, padding:0 }}>×</button>
                </div>
                <p style={{ fontSize:14, color:'#888', lineHeight:1.7, marginBottom:24 }}>
                  Sharing your measurements helps {learner.name.split(' ')[0]} create a perfectly fitted garment for you. This is optional.
                </p>

                {wantsMeas === null ? (
                  <div style={{ display:'flex', gap:12 }}>
                    <button onClick={()=>setWantsMeas(true)} style={{ flex:1, padding:'16px', fontSize:14, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>
                      Yes, add measurements 📏
                    </button>
                    <button onClick={()=>{ setWantsMeas(false); submitEnquiry({ preventDefault:()=>{} }) }} style={{ flex:1, padding:'16px', fontSize:14, fontWeight:500, background:'#F7F6F4', color:'#555', border:'1px solid #E2E0DC', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>
                      No, skip this
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                      {MEASUREMENTS.map(m=>(
                        <div key={m}>
                          <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#888', marginBottom:4 }}>{m} (inches)</label>
                          <input type="number" step="0.5" className="inf" value={meas[m]||''} onChange={e=>setMeas(p=>({...p,[m]:e.target.value}))} placeholder="e.g. 36"/>
                        </div>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>setWantsMeas(null)} style={{ padding:'12px 20px', fontSize:13, background:'#F7F6F4', border:'1px solid #E2E0DC', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>← Back</button>
                      <button onClick={()=>submitEnquiry({ preventDefault:()=>{} })} disabled={submitting} style={{ flex:1, padding:'12px', fontSize:14, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                        {submitting?<Spinner size={16} color="#fff"/>:'Send with measurements →'}
                      </button>
                    </div>
                  </>
                )}
              </div>

            ) : (
              // Step 1: Main form
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
                  <div>
                    <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:'#111', marginBottom:4 }}>{enquiry?.name?'Order enquiry':'Get in touch'}</div>
                    {enquiry?.name&&<div style={{ fontSize:14, color:'#888' }}>{enquiry.name}{enquiry?.price&&Number(enquiry.price)>0?` · ₹${Number(enquiry.price).toLocaleString('en-IN')}`:''}</div>}
                  </div>
                  <button onClick={()=>setEnquiry(null)} style={{ background:'none', border:'none', fontSize:26, cursor:'pointer', color:'#ccc', lineHeight:1, padding:0 }}>×</button>
                </div>
                <form onSubmit={submitEnquiry} style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  {[['Your name *','name','text'],['Email address','email','email'],['WhatsApp number','phone','tel']].map(([l,k,t])=>(
                    <div key={k}>
                      <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#888', marginBottom:5 }}>{l}</label>
                      <input type={t} className="inf" value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} required={l.includes('*')}/>
                    </div>
                  ))}
                  {enquiry?.sizes&&(
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#888', marginBottom:5 }}>Size preference</label>
                      <input className="inf" value={form.size} onChange={e=>setForm(p=>({...p,size:e.target.value}))} placeholder={`Available: ${enquiry.sizes}`}/>
                    </div>
                  )}
                  <div>
                    <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#888', marginBottom:5 }}>Your message *</label>
                    <textarea className="inf" rows={4} style={{ resize:'vertical' }} value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} required/>
                  </div>
                  <button type="submit" style={{ marginTop:4, padding:'14px', fontSize:14, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    {enquiry?.id ? 'Next: add measurements →' : 'Send message'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewForm({ learnerId, onSubmitted, G }) {
  const [form,      setForm]      = useState({ reviewer:'', rating:5, text:'' })
  const [submitted, setSubmitted] = useState(false)
  const [loading,   setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.reviewer || !form.text) return
    setLoading(true)
    await supabase.from('reviews').insert({
      learner_id: learnerId,
      reviewer:   form.reviewer,
      rating:     form.rating,
      text:       form.text,
      approved:   false,
    })
    setLoading(false)
    setSubmitted(true)
    if (onSubmitted) onSubmitted()
  }

  const inp = { width:'100%', padding:'11px 14px', fontSize:14, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', borderRadius:10, outline:'none', color:'#fff', fontFamily:'inherit', transition:'border-color .15s' }

  if (submitted) return (
    <div style={{ maxWidth:480, margin:'0 auto', textAlign:'center', padding:'40px 24px', background:'rgba(255,255,255,.04)', borderRadius:16, border:'1px solid rgba(255,255,255,.07)' }}>
      <div style={{ fontSize:36, marginBottom:12 }}>✦</div>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:'#fff', marginBottom:8 }}>Thank you!</div>
      <p style={{ fontSize:14, color:'#666' }}>Your review has been submitted and will appear after approval.</p>
    </div>
  )

  return (
    <div style={{ maxWidth:560, margin:'0 auto' }}>
      <div style={{ textAlign:'center', marginBottom:28 }}>
        <div style={{ fontSize:15, fontWeight:500, color:'#fff', marginBottom:6 }}>Leave a review</div>
        <p style={{ fontSize:13, color:'#555' }}>Share your experience working with this designer</p>
      </div>
      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <input value={form.reviewer} onChange={e=>setForm(p=>({...p,reviewer:e.target.value}))} placeholder="Your name *" required style={inp}/>
        <div>
          <div style={{ fontSize:12, color:'#666', marginBottom:8 }}>Rating</div>
          <div style={{ display:'flex', gap:6 }}>
            {[1,2,3,4,5].map(s=>(
              <button type="button" key={s} onClick={()=>setForm(p=>({...p,rating:s}))}
                style={{ fontSize:28, background:'none', border:'none', cursor:'pointer', color: s<=form.rating ? G : '#333', padding:0, transition:'color .1s' }}>★</button>
            ))}
          </div>
        </div>
        <textarea value={form.text} onChange={e=>setForm(p=>({...p,text:e.target.value}))} placeholder="Share your experience with this designer *" required rows={4}
          style={{ ...inp, resize:'vertical' }}/>
        <button type="submit" disabled={loading}
          style={{ padding:'14px', fontSize:14, fontWeight:600, background:G, border:'none', borderRadius:10, color:'#fff', cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 20px rgba(244,98,42,.25)` }}>
          {loading ? 'Submitting…' : 'Submit review →'}
        </button>
      </form>
    </div>
  )
}
