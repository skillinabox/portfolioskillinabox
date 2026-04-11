import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'

export default function Portfolio() {
  const { slug } = useParams()
  const [learner, setLearner]   = useState(null)
  const [garments, setGarments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showEnquiry, setEnquiry] = useState(null) // garment or 'general'
  const [form, setForm] = useState({ name: '', email: '', phone: '', size: '', message: '', type: 'enquiry' })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: l } = await supabase.from('learners').select('*').eq('slug', slug).eq('status', 'published').single()
      if (!l) { setLoading(false); return }
      const { data: g } = await supabase.from('garments').select('*').eq('learner_id', l.id).eq('status', 'published').order('created_at')
      setLearner(l); setGarments(g || []); setLoading(false)
    }
    load()
  }, [slug])

  async function submitEnquiry(e) {
    e.preventDefault()
    setSubmitting(true)
    await supabase.from('enquiries').insert({
      learner_id: learner.id,
      from_name: form.name,
      from_email: form.email,
      from_phone: form.phone,
      type: showEnquiry?.id ? 'order' : 'enquiry',
      garment_name: showEnquiry?.name || null,
      size: form.size || null,
      message: form.message,
    })
    setSubmitting(false); setSubmitted(true)
    setTimeout(() => { setEnquiry(null); setSubmitted(false); setForm({ name: '', email: '', phone: '', size: '', message: '', type: 'enquiry' }) }, 2500)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner size={28} />
    </div>
  )

  if (!learner) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12, textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 36 }}>🔍</div>
      <h2 style={{ fontFamily: "'DM Serif Display', serif" }}>Portfolio not found</h2>
      <p style={{ fontSize: 14, color: '#888' }}>This portfolio doesn't exist or hasn't been published yet.</p>
    </div>
  )

  const brandColor = '#B5637A'
  const brandDark  = '#8C3F57'

  return (
    <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FAFAFA', minHeight: '100vh' }}>
      {/* Hero */}
      <div style={{ background: `linear-gradient(150deg, ${brandDark} 0%, ${brandColor} 60%, #C8849A 100%)`, padding: '56px 0 44px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .06, backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px', position: 'relative' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,.55)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>Skillinabox Graduate</div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 46, color: '#fff', lineHeight: 1.15, marginBottom: 10 }}>{learner.brand || learner.name}</h1>
          {learner.tagline && <p style={{ fontSize: 16, color: 'rgba(255,255,255,.75)', fontStyle: 'italic', marginBottom: 14 }}>{learner.tagline}</p>}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>by {learner.name}</div>
        </div>
      </div>

      {/* Nav strip */}
      <div style={{ background: '#1C1C1C', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0 }}>
        <div style={{ maxWidth: 800, width: '100%', margin: '0 auto', display: 'flex', gap: 24 }}>
          {['Collection', 'About', 'Contact'].map(n => (
            <a key={n} href={`#${n.toLowerCase()}`} style={{ padding: '13px 0', fontSize: 13, color: 'rgba(255,255,255,.55)', borderBottom: '2px solid transparent', display: 'inline-block', transition: 'color .15s' }}>{n}</a>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <button onClick={() => setEnquiry('general')} style={{ padding: '8px 16px', margin: '8px 0', fontSize: 12, fontWeight: 500, background: brandColor, color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer' }}>Get in touch</button>
          </div>
        </div>
      </div>

      {/* Collection */}
      <div id="collection" style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 28 }}>Collection · {garments.length} piece{garments.length !== 1 ? 's' : ''}</div>
        {garments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#aaa', fontSize: 14 }}>Garments coming soon…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
            {garments.map((g, i) => (
              <div key={g.id} style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: '1px solid #EEE' }}>
                <div style={{ height: 280, background: g.image_url ? `url(${g.image_url}) center/cover` : ['#F7EEF1','#E8F5ED','#F0EFFE','#FEF3E2'][i%4], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, color: [brandColor,'#0D6B3A','#5B21B6','#92400E'][i%4] }}>
                  {!g.image_url && (g.name?.[0] || '?')}
                </div>
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1A1A1A', marginBottom: 5 }}>{g.name}</div>
                  {g.fabric && <div style={{ fontSize: 13, color: '#888', marginBottom: 6 }}>{g.fabric}{g.colour ? ` · ${g.colour}` : ''}</div>}
                  {g.description && <div style={{ fontSize: 13, color: '#555', lineHeight: 1.6, marginBottom: 12 }}>{g.description}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: brandDark }}>₹{Number(g.price).toLocaleString('en-IN')}</div>
                    <span style={{ fontSize: 11, color: '#999', background: '#F5F5F5', padding: '3px 10px', borderRadius: 99 }}>{g.availability}</span>
                  </div>
                  {g.sizes && <div style={{ fontSize: 12, color: '#888', marginTop: 6 }}>Sizes: {g.sizes}</div>}
                  <button onClick={() => { setEnquiry(g); setForm(p => ({ ...p, message: `Hi, I'm interested in the ${g.name}. ` })) }}
                    style={{ marginTop: 14, width: '100%', padding: 10, fontSize: 13, fontWeight: 500, background: `linear-gradient(135deg, ${brandColor} 0%, ${brandDark} 100%)`, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                    Enquire / Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* About */}
      <div id="about" style={{ background: '#fff', padding: '48px 24px', borderTop: '1px solid #EEE' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 20 }}>About</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: '#1A1A1A', marginBottom: 10 }}>{learner.name}</h2>
          {learner.tagline && <p style={{ fontSize: 16, color: '#555', fontStyle: 'italic', lineHeight: 1.6 }}>{learner.tagline}</p>}
          <div style={{ marginTop: 16, fontSize: 13, color: '#888', background: '#F5F5F5', display: 'inline-block', padding: '4px 12px', borderRadius: 99 }}>Trained at Skillinabox · Fashion Design Programme</div>
        </div>
      </div>

      {/* Contact */}
      <div id="contact" style={{ padding: '48px 24px', background: '#FAFAFA' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#aaa', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 20 }}>Contact</div>
          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
            {learner.phone && (
              <a href={`https://wa.me/${learner.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 3 }}>WhatsApp</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: brandDark }}>{learner.phone}</div>
              </a>
            )}
            {learner.email && (
              <a href={`mailto:${learner.email}`} style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 3 }}>Email</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: brandDark }}>{learner.email}</div>
              </a>
            )}
            {learner.instagram && (
              <a href={`https://instagram.com/${learner.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{ fontSize: 11, color: '#aaa', marginBottom: 3 }}>Instagram</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: brandDark }}>{learner.instagram}</div>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid #EEE', textAlign: 'center' }}>
        <span style={{ fontSize: 12, color: '#bbb' }}>Portfolio powered by <span style={{ color: brandColor, fontWeight: 500 }}>Skillinabox</span></span>
      </div>

      {/* Enquiry modal */}
      {showEnquiry && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => e.target === e.currentTarget && setEnquiry(null)}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,.2)', animation: 'fadeIn .2s ease' }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Message sent!</div>
                <div style={{ fontSize: 13, color: '#888' }}>{learner.name} will get back to you shortly.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600 }}>{showEnquiry?.name ? `Order: ${showEnquiry.name}` : 'Get in touch'}</div>
                    {showEnquiry?.price && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>₹{Number(showEnquiry.price).toLocaleString('en-IN')}</div>}
                  </div>
                  <button onClick={() => setEnquiry(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
                </div>
                <form onSubmit={submitEnquiry} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {[['Your name *', 'name', 'text'], ['Email address', 'email', 'email'], ['WhatsApp number', 'phone', 'tel']].map(([l, k, t]) => (
                    <div key={k}>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>{l}</label>
                      <input type={t} className="input" value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} required={l.includes('*')} />
                    </div>
                  ))}
                  {showEnquiry?.sizes && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Size</label>
                      <input className="input" value={form.size} onChange={e => setForm(p => ({ ...p, size: e.target.value }))} placeholder={`Available: ${showEnquiry.sizes}`} />
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 4 }}>Message *</label>
                    <textarea className="input" rows={3} style={{ resize: 'vertical' }} value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} required />
                  </div>
                  <button type="submit" disabled={submitting} style={{ marginTop: 4, padding: 12, fontSize: 14, fontWeight: 500, background: `linear-gradient(135deg, ${brandColor} 0%, ${brandDark} 100%)`, color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {submitting ? <Spinner size={16} color="#fff" /> : 'Send message'}
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
