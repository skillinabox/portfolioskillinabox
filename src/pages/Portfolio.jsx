import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'

export default function Portfolio() {
  const { slug } = useParams()
  const [learner, setLearner]       = useState(null)
  const [garments, setGarments]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [enquiry, setEnquiry]       = useState(null)
  const [activeSection, setActive]  = useState('home')
  const [form, setForm]             = useState({ name:'', email:'', phone:'', size:'', message:'' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)

  useEffect(() => {
    async function load() {
      const { data:l } = await supabase.from('learners').select('*').eq('slug', slug).eq('status','published').single()
      if (!l) { setLoading(false); return }
      const { data:g } = await supabase.from('garments').select('*').eq('learner_id', l.id).eq('status','published').order('collection_name').order('created_at')
      setLearner(l); setGarments(g||[]); setLoading(false)
    }
    load()
  }, [slug])

  useEffect(() => {
    const handler = () => {
      const ids = ['home','collection','about','expertise','contact']
      for (const id of [...ids].reverse()) {
        const el = document.getElementById(id)
        if (el && window.scrollY >= el.offsetTop - 120) { setActive(id); break }
      }
    }
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  async function submitEnquiry(e) {
    e.preventDefault(); setSubmitting(true)
    await supabase.from('enquiries').insert({
      learner_id: learner.id, from_name: form.name, from_email: form.email,
      from_phone: form.phone, type: enquiry?.id ? 'order' : 'enquiry',
      garment_name: enquiry?.name||null, size: form.size||null, message: form.message,
    })
    setSubmitting(false); setSubmitted(true)
    setTimeout(() => { setEnquiry(null); setSubmitted(false); setForm({ name:'',email:'',phone:'',size:'',message:'' }) }, 2500)
  }

  function scrollTo(id) { document.getElementById(id)?.scrollIntoView({ behavior:'smooth' }) }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0C0C0C', flexDirection:'column', gap:16 }}>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:20, color:'#fff' }}>Skillinabox</div>
      <Spinner size={24} color="#F4622A"/>
    </div>
  )

  if (!learner) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, background:'#0C0C0C', padding:24 }}>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:28, color:'#fff' }}>Portfolio not found</div>
      <p style={{ fontSize:14, color:'#666' }}>This portfolio doesn't exist or hasn't been published yet.</p>
    </div>
  )

  const collections = garments.reduce((acc, g) => {
    const key = g.collection_name || 'Main Collection'
    if (!acc[key]) acc[key] = []
    acc[key].push(g)
    return acc
  }, {})

  const skills    = learner.skills    ? learner.skills.split(',').map(s=>s.trim()).filter(Boolean) : []
  const expertise = learner.expertise ? learner.expertise.split(',').map(s=>s.trim()).filter(Boolean) : []

  const NAV = ['home','collection','about','expertise','contact']
  const G = '#F4622A'

  const defaultExpertise = [
    ['✦','Garment Construction','Expert knowledge of fabric handling, cutting, stitching and finishing techniques.'],
    ['◈','Design Thinking','Translating ideas into wearable, market-ready fashion pieces with precision.'],
    ['⟡','Indian Textiles','Deep understanding of traditional Indian fabrics, weaves, prints and embroidery.'],
    ['◎','Pattern Making','Drafting, grading and modifying patterns for a perfect fit across all sizes.'],
  ]

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", minHeight:'100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{background:#F7F6F4}
        .nl{padding:6px 0;font-size:13px;color:#777;cursor:pointer;border:none;border-bottom:2px solid transparent;background:none;font-family:inherit;transition:all .2s;text-transform:capitalize}
        .nl:hover,.nl.on{color:#fff;border-bottom-color:${G}}
        .gc{background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E8E6E2;transition:transform .25s,box-shadow .25s;cursor:pointer;position:relative}
        .gc:hover{transform:translateY(-6px);box-shadow:0 16px 48px rgba(0,0,0,.12)}
        .gc:hover .go{opacity:1;transform:translateY(0)}
        .go{position:absolute;bottom:16px;left:16px;right:16px;background:${G};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;text-align:center;opacity:0;transform:translateY(8px);transition:all .25s}
        .ec{background:#fff;border:1px solid #E8E6E2;border-radius:14px;padding:28px 24px;transition:all .25s}
        .ec:hover{border-color:${G};transform:translateY(-3px);box-shadow:0 8px 24px rgba(244,98,42,.1)}
        .st{display:inline-block;padding:7px 18px;border-radius:99px;font-size:13px;font-weight:500;border:1px solid}
        .inf{width:100%;padding:12px 14px;font-size:14px;border:1px solid #E2E0DC;border-radius:10px;outline:none;transition:border-color .15s;font-family:inherit;background:#fff}
        .inf:focus{border-color:${G}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .7s ease both}
      `}</style>

      {/* NAV */}
      <nav style={{ position:'fixed', top:0, left:0, right:0, zIndex:100, background:'rgba(10,10,10,.94)', backdropFilter:'blur(16px)', borderBottom:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 24px', display:'flex', alignItems:'center', justifyContent:'space-between', height:58 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
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
          <div style={{ display:'flex', gap:24, alignItems:'center' }}>
            {NAV.map(n=>(
              <button key={n} className={`nl ${activeSection===n?'on':''}`} onClick={()=>scrollTo(n)}>{n.charAt(0).toUpperCase()+n.slice(1)}</button>
            ))}
            <button onClick={()=>setEnquiry('general')} style={{ padding:'9px 20px', fontSize:13, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit', marginLeft:8 }}>Get in touch</button>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section id="home" style={{ minHeight:'100vh', background:'#0A0A0A', display:'flex', alignItems:'center', paddingTop:58, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(244,98,42,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(244,98,42,.05) 1px,transparent 1px)`, backgroundSize:'56px 56px' }}/>
        <div style={{ position:'absolute', top:'15%', right:'8%', width:500, height:500, borderRadius:'50%', background:`radial-gradient(circle, rgba(244,98,42,.1) 0%, transparent 65%)`, pointerEvents:'none' }}/>
        <div style={{ position:'absolute', bottom:'15%', left:'2%', width:320, height:320, borderRadius:'50%', background:`radial-gradient(circle, rgba(0,180,216,.07) 0%, transparent 65%)`, pointerEvents:'none' }}/>

        <div style={{ maxWidth:1100, margin:'0 auto', padding:'80px 24px', position:'relative', width:'100%' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:72, alignItems:'center' }}>
            <div className="fu">
              <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.14em', textTransform:'uppercase', marginBottom:20 }}>
                Skillinabox Graduate · Fashion Designer
              </div>
              <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:clamp(40,5.5,72), color:'#fff', lineHeight:1.08, marginBottom:20 }}>
                {learner.brand||learner.name}
              </h1>
              {learner.tagline && <p style={{ fontSize:17, color:'#666', lineHeight:1.8, marginBottom:36, maxWidth:460 }}>{learner.tagline}</p>}
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <button onClick={()=>scrollTo('collection')} style={{ padding:'14px 30px', fontSize:14, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 20px rgba(244,98,42,.3)` }}>View collection</button>
                <button onClick={()=>scrollTo('about')} style={{ padding:'14px 30px', fontSize:14, fontWeight:500, background:'transparent', color:'#ccc', border:'1px solid rgba(255,255,255,.15)', borderRadius:10, cursor:'pointer', fontFamily:'inherit' }}>About me</button>
              </div>
              <div style={{ display:'flex', gap:40, marginTop:56, paddingTop:40, borderTop:'1px solid rgba(255,255,255,.07)' }}>
                {[[garments.length,'Pieces'],[Object.keys(collections).length,'Collections'],[learner.years_exp||'New','Years exp.']].map(([v,l])=>(
                  <div key={l}>
                    <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:30, color:'#fff' }}>{v}</div>
                    <div style={{ fontSize:12, color:'#555', marginTop:4 }}>{l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Garment stack */}
            <div style={{ position:'relative', height:520 }}>
              {garments.slice(0,3).map((g, i) => (
                <div key={g.id} style={{
                  position:'absolute',
                  width: i===0?'78%':i===1?'62%':'52%',
                  top: i===0?0:i===1?'8%':'16%',
                  right: i===0?0:i===1?'-5%':'-10%',
                  borderRadius:16, overflow:'hidden',
                  boxShadow: `0 ${24-i*6}px ${80-i*20}px rgba(0,0,0,.${5+i})`,
                  border:'1px solid rgba(255,255,255,.07)',
                  transform: `rotate(${i*2.5}deg)`,
                  zIndex: 3-i,
                }}>
                  <div style={{ paddingBottom:'125%', position:'relative', background:'#1A1A1A' }}>
                    {g.image_url
                      ? <img src={g.image_url} alt={g.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
                      : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:56, color:G }}>{g.name?.[0]||'?'}</div>
                    }
                  </div>
                </div>
              ))}
              {garments.length===0 && (
                <div style={{ position:'absolute', inset:0, borderRadius:16, background:'#1A1A1A', border:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'center', color:'#333', fontSize:14 }}>Collection coming soon</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ position:'absolute', bottom:28, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer', opacity:.4 }} onClick={()=>scrollTo('collection')}>
          <div style={{ fontSize:10, color:'#fff', letterSpacing:'.1em', textTransform:'uppercase' }}>Scroll</div>
          <div style={{ width:1, height:36, background:`linear-gradient(to bottom,${G},transparent)` }}/>
        </div>
      </section>

      {/* COLLECTION */}
      <section id="collection" style={{ padding:'96px 24px', background:'#F7F6F4' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:56, flexWrap:'wrap', gap:16 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Portfolio</div>
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:44, color:'#111', lineHeight:1.15 }}>The Collection</h2>
            </div>
            <div style={{ fontSize:14, color:'#888' }}>{garments.length} piece{garments.length!==1?'s':''} across {Object.keys(collections).length} collection{Object.keys(collections).length!==1?'s':''}</div>
          </div>

          {Object.entries(collections).map(([name, items]) => (
            <div key={name} style={{ marginBottom:72 }}>
              <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:36 }}>
                <h3 style={{ fontFamily:"'DM Serif Display',serif", fontSize:26, color:'#111', whiteSpace:'nowrap' }}>{name}</h3>
                <div style={{ flex:1, height:1, background:'#E2E0DC' }}/>
                <span style={{ fontSize:13, color:'#aaa', whiteSpace:'nowrap' }}>{items.length} piece{items.length!==1?'s':''}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))', gap:24 }}>
                {items.map(g=>(
                  <div key={g.id} className="gc" onClick={()=>{ setEnquiry(g); setForm(p=>({...p,message:`Hi, I'm interested in the ${g.name}. `})) }}>
                    <div style={{ position:'relative', paddingBottom:'118%', background:'#F0EDEA' }}>
                      {g.image_url
                        ? <img src={g.image_url} alt={g.name} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover' }}/>
                        : <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:60, color:'#D0CBC4' }}>{g.name?.[0]||'?'}</div>
                      }
                      <div className="go">Enquire about this piece →</div>
                    </div>
                    <div style={{ padding:'18px 20px 22px' }}>
                      <div style={{ fontSize:15, fontWeight:600, color:'#111', marginBottom:5, lineHeight:1.3 }}>{g.name}</div>
                      {(g.fabric||g.colour) && <div style={{ fontSize:13, color:'#888', marginBottom:10 }}>{[g.fabric,g.colour].filter(Boolean).join(' · ')}</div>}
                      {g.description && <div style={{ fontSize:13, color:'#666', lineHeight:1.65, marginBottom:14 }}>{g.description}</div>}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ fontSize:20, fontWeight:700, color:g.price&&Number(g.price)>0?'#C94E1E':'#999' }}>
                          {g.price&&Number(g.price)>0?`₹${Number(g.price).toLocaleString('en-IN')}`:'Price on request'}
                        </div>
                        <span style={{ fontSize:11, color:'#888', background:'#F0EDEA', padding:'4px 12px', borderRadius:99 }}>{g.availability||'Made to order'}</span>
                      </div>
                      {g.occasion && <div style={{ fontSize:12, color:'#bbb', marginTop:8 }}>Perfect for: {g.occasion}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {garments.length===0 && (
            <div style={{ textAlign:'center', padding:'80px 24px' }}>
              <div style={{ fontSize:48, color:'#ddd', marginBottom:16 }}>✦</div>
              <div style={{ fontSize:16, fontWeight:500, color:'#aaa' }}>Collection coming soon</div>
            </div>
          )}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ padding:'96px 24px', background:'#0F0F0F', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:`linear-gradient(rgba(244,98,42,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(244,98,42,.04) 1px,transparent 1px)`, backgroundSize:'48px 48px' }}/>
        <div style={{ maxWidth:1100, margin:'0 auto', position:'relative' }}>
          <div style={{ display:'grid', gridTemplateColumns:'5fr 6fr', gap:80, alignItems:'center' }}>
            {/* Designer card */}
            <div>
              <div style={{ aspectRatio:'3/4', borderRadius:20, overflow:'hidden', background:'#1A1A1A', border:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:100, color:`rgba(244,98,42,.12)`, lineHeight:1, userSelect:'none' }}>
                  {learner.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)}
                </div>
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top, rgba(0,0,0,.8) 0%, transparent 50%)' }}/>
                <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:24 }}>
                  <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:'#fff', marginBottom:5 }}>{learner.name}</div>
                  <div style={{ fontSize:13, color:'#888' }}>{learner.speciality||'Fashion Designer · Skillinabox Graduate'}</div>
                  {learner.location && <div style={{ fontSize:12, color:'#555', marginTop:4 }}>📍 {learner.location}</div>}
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:16 }}>About the designer</div>
              <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:40, color:'#fff', lineHeight:1.2, marginBottom:24 }}>The story behind the brand</h2>
              <p style={{ fontSize:15, color:'#666', lineHeight:1.9, marginBottom:32 }}>
                {learner.bio || `${learner.name} is a passionate fashion designer and proud graduate of the Skillinabox Fashion Design Programme. With a deep love for craftsmanship and an eye for detail, ${learner.name.split(' ')[0]} creates garments that celebrate the richness of Indian textiles while embracing contemporary design sensibilities.`}
              </p>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:36 }}>
                {[
                  ['Location', learner.location||'India'],
                  ['Speciality', learner.speciality||'Fashion Design'],
                  ['Training', 'Skillinabox Programme'],
                  ['Collections', `${Object.keys(collections).length} published`],
                ].map(([label, value])=>(
                  <div key={label} style={{ padding:'14px 16px', background:'rgba(255,255,255,.04)', borderRadius:10, border:'1px solid rgba(255,255,255,.05)' }}>
                    <div style={{ fontSize:11, color:'#444', marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:14, fontWeight:500, color:'#bbb' }}>{value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                <button onClick={()=>setEnquiry('general')} style={{ padding:'12px 24px', fontSize:13, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:9, cursor:'pointer', fontFamily:'inherit' }}>Commission a piece</button>
                {learner.instagram && (
                  <a href={`https://instagram.com/${learner.instagram.replace('@','')}`} target="_blank" rel="noreferrer" style={{ padding:'12px 24px', fontSize:13, fontWeight:500, background:'transparent', color:'#bbb', border:'1px solid rgba(255,255,255,.12)', borderRadius:9, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:6 }}>Instagram ↗</a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EXPERTISE */}
      <section id="expertise" style={{ padding:'96px 24px', background:'#F7F6F4' }}>
        <div style={{ maxWidth:1100, margin:'0 auto' }}>
          <div style={{ textAlign:'center', marginBottom:60 }}>
            <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>Skills & expertise</div>
            <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:44, color:'#111', marginBottom:16 }}>What I bring to the table</h2>
            <p style={{ fontSize:15, color:'#888', maxWidth:500, margin:'0 auto', lineHeight:1.7 }}>A blend of traditional craftsmanship and contemporary design thinking, honed through the Skillinabox programme.</p>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, justifyContent:'center', marginBottom:56 }}>
              {skills.map((s,i) => {
                const cols = [['#FEF0EA','#C94E1E'],['#E6F4EC','#0D6B3A'],['#F0EFFE','#5B21B6'],['#FEF3E2','#92400E'],['#EFF6FF','#1D4ED8'],['#FDF4FF','#7E22CE']]
                const [bg,fg] = cols[i%6]
                return <span key={s} className="st" style={{ background:bg, color:fg, borderColor:fg+'40' }}>{s}</span>
              })}
            </div>
          )}

          {/* Expertise cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:20, marginBottom:56 }}>
            {(expertise.length>0 ? expertise.map((ex,i)=>[['✦','◈','⟡','◎','⬡','⊕'][i%6], ex, '']) : defaultExpertise).map(([icon,title,desc])=>(
              <div key={title} className="ec">
                <div style={{ fontSize:22, color:G, marginBottom:14 }}>{icon}</div>
                <div style={{ fontSize:15, fontWeight:600, color:'#111', marginBottom:8 }}>{title}</div>
                {desc && <div style={{ fontSize:13, color:'#888', lineHeight:1.65 }}>{desc}</div>}
              </div>
            ))}
          </div>

          {/* SIB badge */}
          <div style={{ padding:'32px 40px', background:'#111', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'space-between', gap:24, flexWrap:'wrap' }}>
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

      {/* CONTACT */}
      <section id="contact" style={{ padding:'96px 24px', background:'#0A0A0A' }}>
        <div style={{ maxWidth:760, margin:'0 auto', textAlign:'center' }}>
          <div style={{ fontSize:11, fontWeight:600, color:G, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:16 }}>Let's work together</div>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:52, color:'#fff', lineHeight:1.15, marginBottom:16 }}>Interested in a piece?</h2>
          <p style={{ fontSize:16, color:'#555', lineHeight:1.8, maxWidth:460, margin:'0 auto 52px' }}>
            Whether you want to place an order, discuss a custom design, or simply learn more about my work — I'd love to hear from you.
          </p>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14, marginBottom:48 }}>
            {[
              learner.phone && { label:'WhatsApp', value:learner.phone, href:`https://wa.me/${learner.phone.replace(/\D/g,'')}`, color:'#25D366' },
              learner.email && { label:'Email', value:learner.email, href:`mailto:${learner.email}`, color:G },
              learner.instagram && { label:'Instagram', value:learner.instagram, href:`https://instagram.com/${learner.instagram.replace('@','')}`, color:'#E1306C' },
            ].filter(Boolean).map(item=>(
              <a key={item.label} href={item.href} target="_blank" rel="noreferrer"
                style={{ padding:'24px 20px', background:'rgba(255,255,255,.04)', borderRadius:14, border:'1px solid rgba(255,255,255,.06)', textDecoration:'none', display:'block', transition:'all .2s' }}
                onMouseOver={e=>{ e.currentTarget.style.borderColor=item.color+'55'; e.currentTarget.style.background='rgba(255,255,255,.07)' }}
                onMouseOut={e=>{ e.currentTarget.style.borderColor='rgba(255,255,255,.06)'; e.currentTarget.style.background='rgba(255,255,255,.04)' }}>
                <div style={{ fontSize:11, color:'#444', letterSpacing:'.08em', textTransform:'uppercase', marginBottom:8 }}>{item.label}</div>
                <div style={{ fontSize:13, fontWeight:500, color:item.color, wordBreak:'break-all' }}>{item.value}</div>
              </a>
            ))}
          </div>

          <button onClick={()=>setEnquiry('general')} style={{ padding:'16px 44px', fontSize:15, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:12, cursor:'pointer', fontFamily:'inherit', boxShadow:`0 4px 24px rgba(244,98,42,.35)` }}>
            Send a message →
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <div style={{ padding:'20px 24px', background:'#060606', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:12, color:'#2A2A2A' }}>
          © {new Date().getFullYear()} {learner.brand||learner.name} · Portfolio by <span style={{ color:G }}>Skillinabox</span>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          {NAV.map(n=><button key={n} onClick={()=>scrollTo(n)} style={{ fontSize:12, color:'#2A2A2A', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>{n}</button>)}
        </div>
      </div>

      {/* ENQUIRY MODAL */}
      {enquiry && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={e=>e.target===e.currentTarget&&setEnquiry(null)}>
          <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:480, padding:32, boxShadow:'0 40px 100px rgba(0,0,0,.4)' }}>
            {submitted ? (
              <div style={{ textAlign:'center', padding:'32px 0' }}>
                <div style={{ width:56, height:56, borderRadius:'50%', background:'#E6F4EC', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 16px', color:'#0D6B3A' }}>✓</div>
                <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, marginBottom:8 }}>Message sent!</div>
                <div style={{ fontSize:14, color:'#888' }}>{learner.name} will get back to you shortly.</div>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24 }}>
                  <div>
                    <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:'#111', marginBottom:4 }}>{enquiry?.name?'Order enquiry':'Get in touch'}</div>
                    {enquiry?.name && <div style={{ fontSize:14, color:'#888' }}>{enquiry.name}{enquiry?.price&&Number(enquiry.price)>0?` · ₹${Number(enquiry.price).toLocaleString('en-IN')}`:''}</div>}
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
                  {enquiry?.sizes && (
                    <div>
                      <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#888', marginBottom:5 }}>Size preference</label>
                      <input className="inf" value={form.size} onChange={e=>setForm(p=>({...p,size:e.target.value}))} placeholder={`Available: ${enquiry.sizes}`}/>
                    </div>
                  )}
                  <div>
                    <label style={{ display:'block', fontSize:12, fontWeight:500, color:'#888', marginBottom:5 }}>Your message *</label>
                    <textarea className="inf" rows={4} style={{ resize:'vertical' }} value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} required/>
                  </div>
                  <button type="submit" disabled={submitting} style={{ marginTop:4, padding:'14px', fontSize:14, fontWeight:600, background:G, color:'#fff', border:'none', borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:'inherit', opacity:submitting?.7:1 }}>
                    {submitting?<Spinner size={16} color="#fff"/>:'Send message'}
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

function clamp(min, vw, max) {
  return `clamp(${min}px, ${vw}vw, ${max}px)`
}
