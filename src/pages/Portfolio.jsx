import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'

export default function Portfolio() {
  const { slug } = useParams()
  const [learner, setLearner]     = useState(null)
  const [garments, setGarments]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [enquiry, setEnquiry]     = useState(null)
  const [form, setForm]           = useState({ name:'', email:'', phone:'', size:'', message:'' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)

  useEffect(() => {
    async function load() {
      const { data:l } = await supabase.from('learners').select('*').eq('slug', slug).eq('status','published').single()
      if (!l) { setLoading(false); return }
      const { data:g } = await supabase.from('garments').select('*').eq('learner_id', l.id).eq('status','published').order('created_at')
      setLearner(l); setGarments(g||[]); setLoading(false)
    }
    load()
  }, [slug])

  async function submitEnquiry(e) {
    e.preventDefault()
    setSubmitting(true)
    await supabase.from('enquiries').insert({
      learner_id: learner.id,
      from_name:  form.name,
      from_email: form.email,
      from_phone: form.phone,
      type:       enquiry?.id ? 'order' : 'enquiry',
      garment_name: enquiry?.name || null,
      size:       form.size || null,
      message:    form.message,
    })
    setSubmitting(false); setSubmitted(true)
    setTimeout(()=>{ setEnquiry(null); setSubmitted(false); setForm({ name:'',email:'',phone:'',size:'',message:'' }) }, 2500)
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#111', flexDirection:'column', gap:12 }}>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:18, color:'#fff' }}>Skillinabox</div>
      <Spinner size={24} color="#F4622A"/>
    </div>
  )

  if (!learner) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, textAlign:'center', padding:24, background:'#111' }}>
      <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:24, color:'#fff' }}>Portfolio not found</div>
      <p style={{ fontSize:14, color:'#666' }}>This portfolio doesn't exist or hasn't been published yet.</p>
    </div>
  )

  return (
    <div style={{ fontFamily:"'DM Sans',system-ui,sans-serif", background:'#F7F6F4', minHeight:'100vh' }}>
      {/* Hero */}
      <div style={{ background:'#111', padding:'64px 0 48px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(244,98,42,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(244,98,42,.06) 1px, transparent 1px)', backgroundSize:'48px 48px' }}/>
        <div style={{ maxWidth:800, margin:'0 auto', padding:'0 24px', position:'relative' }}>
          <div style={{ fontSize:11, fontWeight:500, color:'#444', letterSpacing:'.12em', textTransform:'uppercase', marginBottom:12 }}>
            Skillinabox Portfolio · Graduate
          </div>
          <h1 style={{ fontFamily:"'DM Serif Display',serif", fontSize:52, color:'#fff', lineHeight:1.12, marginBottom:10 }}>{learner.brand||learner.name}</h1>
          {learner.tagline && <p style={{ fontSize:16, color:'#777', fontStyle:'italic', marginBottom:16 }}>{learner.tagline}</p>}
          <div style={{ fontSize:13, color:'#555' }}>by {learner.name}</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ background:'#1A1A1A', padding:'0 24px' }}>
        <div style={{ maxWidth:800, margin:'0 auto', display:'flex', alignItems:'center', gap:24 }}>
          {['Collection','About','Contact'].map(n=>(
            <a key={n} href={`#${n.toLowerCase()}`} style={{ padding:'13px 0', fontSize:13, color:'#666', display:'inline-block' }}>{n}</a>
          ))}
          <div style={{ marginLeft:'auto' }}>
            <button onClick={()=>setEnquiry('general')} style={{ padding:'8px 16px', margin:'8px 0', fontSize:12, fontWeight:500, background:'#F4622A', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontFamily:'inherit' }}>Get in touch</button>
          </div>
        </div>
      </div>

      {/* Collection */}
      <div id="collection" style={{ maxWidth:800, margin:'0 auto', padding:'52px 24px' }}>
        <div style={{ fontSize:11, fontWeight:600, color:'#AAA', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:28 }}>Collection · {garments.length} piece{garments.length!==1?'s':''}</div>
        {garments.length===0 ? (
          <div style={{ textAlign:'center', padding:'48px 24px', color:'#aaa', fontSize:14 }}>Garments coming soon…</div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:24 }}>
            {garments.map(g=>(
              <div key={g.id} style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:'1px solid #E2E0DC' }}>
                <div style={{ height:300, background:g.image_url?`url(${g.image_url}) center/cover`:'#FEF0EA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:72, fontWeight:700, color:'#F4622A' }}>
                  {!g.image_url&&(g.name?.[0]||'?')}
                </div>
                <div style={{ padding:'18px 20px' }}>
                  <div style={{ fontSize:16, fontWeight:600, color:'#111', marginBottom:5 }}>{g.name}</div>
                  {g.fabric && <div style={{ fontSize:13, color:'#888', marginBottom:6 }}>{g.fabric}{g.colour?` · ${g.colour}`:''}</div>}
                  {g.description && <div style={{ fontSize:13, color:'#555', lineHeight:1.6, marginBottom:12 }}>{g.description}</div>}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ fontSize:22, fontWeight:700, color:'#C94E1E' }}>₹{Number(g.price).toLocaleString('en-IN')}</div>
                    <span style={{ fontSize:11, color:'#888', background:'#F7F6F4', padding:'3px 10px', borderRadius:99 }}>{g.availability}</span>
                  </div>
                  {g.sizes && <div style={{ fontSize:12, color:'#888', marginBottom:12 }}>Sizes: {g.sizes}</div>}
                  <button onClick={()=>{ setEnquiry(g); setForm(p=>({...p,message:`Hi, I'm interested in the ${g.name}. `})) }}
                    style={{ width:'100%', padding:11, fontSize:13, fontWeight:600, background:'#F4622A', color:'#fff', border:'none', borderRadius:9, cursor:'pointer', fontFamily:'inherit' }}>
                    Enquire / Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* About */}
      <div id="about" style={{ background:'#fff', padding:'48px 24px', borderTop:'1px solid #E2E0DC' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#aaa', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:20 }}>About</div>
          <h2 style={{ fontFamily:"'DM Serif Display',serif", fontSize:32, color:'#111', marginBottom:10 }}>{learner.name}</h2>
          {learner.tagline && <p style={{ fontSize:16, color:'#555', fontStyle:'italic', lineHeight:1.6 }}>{learner.tagline}</p>}
          <div style={{ marginTop:16, display:'flex', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:'#888', background:'#F7F6F4', padding:'5px 14px', borderRadius:99 }}>Trained at Skillinabox</span>
            <span style={{ fontSize:12, color:'#888', background:'#F7F6F4', padding:'5px 14px', borderRadius:99 }}>Fashion Design Programme</span>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div id="contact" style={{ padding:'48px 24px', background:'#F7F6F4' }}>
        <div style={{ maxWidth:800, margin:'0 auto' }}>
          <div style={{ fontSize:11, fontWeight:600, color:'#aaa', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:20 }}>Contact</div>
          <div style={{ display:'flex', gap:32, flexWrap:'wrap' }}>
            {learner.phone && <a href={`https://wa.me/${learner.phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}><div style={{ fontSize:11, color:'#aaa', marginBottom:3 }}>WhatsApp</div><div style={{ fontSize:14, fontWeight:600, color:'#C94E1E' }}>{learner.phone}</div></a>}
            {learner.email && <a href={`mailto:${learner.email}`} style={{ textDecoration:'none' }}><div style={{ fontSize:11, color:'#aaa', marginBottom:3 }}>Email</div><div style={{ fontSize:14, fontWeight:600, color:'#C94E1E' }}>{learner.email}</div></a>}
            {learner.instagram && <a href={`https://instagram.com/${learner.instagram.replace('@','')}`} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}><div style={{ fontSize:11, color:'#aaa', marginBottom:3 }}>Instagram</div><div style={{ fontSize:14, fontWeight:600, color:'#C94E1E' }}>{learner.instagram}</div></a>}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding:'16px 24px', borderTop:'1px solid #E2E0DC', textAlign:'center' }}>
        <span style={{ fontSize:12, color:'#bbb' }}>An initiative of <span style={{ color:'#F4622A', fontWeight:500 }}>Skillinabox</span></span>
      </div>

      {/* Enquiry modal */}
      {enquiry && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
          onClick={e=>e.target===e.currentTarget&&setEnquiry(null)}>
          <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:460, padding:28, boxShadow:'0 24px 80px rgba(0,0,0,.2)', animation:'fadeUp .2s ease', fontFamily:"'DM Sans',sans-serif" }}>
            {submitted ? (
              <div style={{ textAlign:'center', padding:'24px 0' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>✓</div>
                <div style={{ fontSize:16, fontWeight:600, marginBottom:6 }}>Message sent!</div>
                <div style={{ fontSize:13, color:'#888' }}>{learner.name} will get back to you shortly.</div>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:16, fontWeight:600 }}>{enquiry?.name?`Order: ${enquiry.name}`:'Get in touch'}</div>
                    {enquiry?.price && <div style={{ fontSize:13, color:'#888', marginTop:2 }}>₹{Number(enquiry.price).toLocaleString('en-IN')}</div>}
                  </div>
                  <button onClick={()=>setEnquiry(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#aaa', lineHeight:1 }}>×</button>
                </div>
                <form onSubmit={submitEnquiry} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {[['Your name *','name','text'],['Email address','email','email'],['WhatsApp number','phone','tel']].map(([l,k,t])=>(
                    <div key={k}>
                      <label style={{ display:'block', fontSize:12, color:'#888', marginBottom:4 }}>{l}</label>
                      <input type={t} style={{ width:'100%', padding:'10px 12px', fontSize:14, border:'1px solid #E2E0DC', borderRadius:9, outline:'none', fontFamily:'inherit' }}
                        value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} required={l.includes('*')}/>
                    </div>
                  ))}
                  {enquiry?.sizes && (
                    <div>
                      <label style={{ display:'block', fontSize:12, color:'#888', marginBottom:4 }}>Size</label>
                      <input style={{ width:'100%', padding:'10px 12px', fontSize:14, border:'1px solid #E2E0DC', borderRadius:9, outline:'none', fontFamily:'inherit' }}
                        value={form.size} onChange={e=>setForm(p=>({...p,size:e.target.value}))} placeholder={`Available: ${enquiry.sizes}`}/>
                    </div>
                  )}
                  <div>
                    <label style={{ display:'block', fontSize:12, color:'#888', marginBottom:4 }}>Message *</label>
                    <textarea style={{ width:'100%', padding:'10px 12px', fontSize:14, border:'1px solid #E2E0DC', borderRadius:9, outline:'none', resize:'vertical', fontFamily:'inherit' }}
                      rows={3} value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} required/>
                  </div>
                  <button type="submit" disabled={submitting} style={{ padding:12, fontSize:14, fontWeight:600, background:'#F4622A', color:'#fff', border:'none', borderRadius:9, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontFamily:'inherit', opacity:submitting?.7:1 }}>
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
