import { useState, useEffect, useRef } from 'react'
import { supabase, uploadGarmentImage, tagGarment } from '../lib/supabase'
import { useAuth } from '../App'
import { Avatar, StatusBadge, FieldRow, GarmentThumb, EmptyState, Spinner, useToast } from '../components/ui'

const POSE_LABELS = ['Front', 'Back', '3/4 Left', '3/4 Right', 'Seated', 'Walking', 'Close-up', 'Detail']

export default function Learner() {
  const { learner: authLearner, refreshLearner, signOut } = useAuth()
  const toast = useToast()
  const [learner, setLearner]     = useState(authLearner)
  const [garments, setGarments]   = useState([])
  const [enquiries, setEnquiries] = useState([])
  const [selGid, setSelGid]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [tab, setTab]             = useState('garments')
  const fileRef = useRef()

  const garment = garments.find(g => g.id === selGid)
  const unread  = enquiries.filter(e => !e.read).length

  useEffect(() => {
    if (authLearner?.id) {
      loadAll(authLearner.id)
      setLearner(authLearner)
    }
  }, [authLearner])

  async function loadAll(lid) {
    setLoading(true)
    const [{ data: g }, { data: e }] = await Promise.all([
      supabase.from('garments').select('*').eq('learner_id', lid).order('created_at'),
      supabase.from('enquiries').select('*').eq('learner_id', lid).order('created_at', { ascending: false }),
    ])
    setGarments(g || [])
    setEnquiries(e || [])
    if (g?.length) setSelGid(g[0].id)
    setLoading(false)
  }

  // Upload garment (learner self-upload)
  async function handleUpload(file) {
    if (!file || !learner) return
    const { data: g, error } = await supabase.from('garments').insert({ learner_id: learner.id, status: 'uploading', name: file.name.replace(/\.[^.]+$/, '') }).select().single()
    if (error) { toast('Upload failed', 'error'); return }
    setGarments(prev => [...prev, g])
    setSelGid(g.id)
    try {
      const imageUrl = await uploadGarmentImage(learner.id, g.id, file)
      await supabase.from('garments').update({ image_url: imageUrl, status: 'tagging' }).eq('id', g.id)
      setGarments(prev => prev.map(x => x.id === g.id ? { ...x, image_url: imageUrl, status: 'tagging' } : x))
      const base64 = await fileToBase64(file)
      const tags = await tagGarment(base64, file.type)
      const updates = { ...tags, status: 'tagged', ai_tagged: true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      setGarments(prev => prev.map(x => x.id === g.id ? { ...x, ...updates } : x))
      toast('Garment added successfully!', 'success')
    } catch {
      await supabase.from('garments').update({ status: 'tagged' }).eq('id', g.id)
      setGarments(prev => prev.map(x => x.id === g.id ? { ...x, status: 'tagged' } : x))
      toast('Uploaded — please fill in the details manually', 'default')
    }
  }

  async function saveGarment(gid, patch) {
    setGarments(prev => prev.map(g => g.id === gid ? { ...g, ...patch } : g))
    await supabase.from('garments').update(patch).eq('id', gid)
    setEditingId(null)
    toast('Saved', 'success')
  }

  async function markRead(eid) {
    await supabase.from('enquiries').update({ read: true }).eq('id', eid)
    setEnquiries(prev => prev.map(e => e.id === eid ? { ...e, read: true } : e))
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Spinner size={28} />
    </div>
  )

  if (!learner) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 500 }}>Account not linked</div>
      <p style={{ fontSize: 13, color: 'var(--gray-400)', maxWidth: 320, textAlign: 'center', lineHeight: 1.5 }}>Your email isn't linked to a learner profile yet. Contact your Skillinabox coordinator.</p>
      <button className="btn btn-default" onClick={signOut}>Sign out</button>
    </div>
  )

  return (
    <div className="app-layout">
      {/* Top bar */}
      <header className="app-topbar">
        <span style={{ fontSize: 20, color: 'var(--brand)' }}>✦</span>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, fontWeight: 400 }}>Skillinabox</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {learner.status === 'published' && learner.slug && (
            <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: 'var(--brand-light)', borderColor: 'var(--brand)', color: 'var(--brand-dark)', fontWeight: 500 }}>↗ View my portfolio</a>
          )}
          <button className="btn btn-default btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="app-sidebar">
        {/* Profile header */}
        <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 10, alignItems: 'center' }}>
          <Avatar name={learner.name} size={38} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-900)' }}>{learner.name}</div>
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{learner.brand || 'No brand set'}</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid var(--gray-100)' }}>
          {[[garments.length, 'Garments'], [enquiries.length, 'Enquiries'], [enquiries.filter(e => e.type === 'order').length, 'Orders']].map(([v, l]) => (
            <div key={l} style={{ padding: '10px 6px', textAlign: 'center', borderRight: '1px solid var(--gray-100)' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--brand)' }}>{v}</div>
              <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Nav */}
        {[
          ['garments',  `My garments`, `${garments.length} piece${garments.length !== 1 ? 's' : ''}`],
          ['enquiries', 'Enquiries & orders', `${unread} unread`],
          ['website',   'My website', learner.status === 'published' ? 'Live ✓' : 'Awaiting publish'],
        ].map(([id, label, sub]) => (
          <div key={id} onClick={() => setTab(id)}
            style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)', borderLeft: `3px solid ${tab === id ? 'var(--brand)' : 'transparent'}`, background: tab === id ? 'var(--brand-pale)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background .12s' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-800)' }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 1 }}>{sub}</div>
            </div>
            {id === 'enquiries' && unread > 0 && (
              <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 99, background: 'var(--brand-light)', color: 'var(--brand-dark)', fontWeight: 600 }}>{unread}</span>
            )}
          </div>
        ))}

        <div style={{ margin: 12, padding: '10px 12px', background: 'var(--gray-50)', border: '1px solid var(--gray-100)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--gray-400)', lineHeight: 1.5 }}>
          To add AI-generated poses or get help, contact your Skillinabox coordinator.
        </div>
      </aside>

      {/* Main */}
      <main className="app-main">
        <div style={{ maxWidth: 760 }}>
          {/* ── GARMENTS ── */}
          {tab === 'garments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card">
                <div className="card-head">
                  <span style={{ fontSize: 13, fontWeight: 600 }}>My garments</span>
                  <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>+ Upload garment</button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); e.target.value = '' }} />
                </div>
                {garments.length === 0 ? (
                  <EmptyState icon="👗" title="No garments yet" message="Upload your first garment photo — AI will auto-tag the fabric, style and features." action={<button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Upload first garment</button>} />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, padding: 14 }}>
                    {garments.map((g, i) => (
                      <GarmentThumb key={g.id} garment={g} index={i} selected={selGid === g.id} onClick={() => setSelGid(g.id)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Selected garment */}
              {garment && (
                <div className="card animate-in">
                  {garment.status === 'tagging' || garment.status === 'uploading' ? (
                    <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <div style={{ fontSize: 36, color: 'var(--brand)', animation: 'spin 2s linear infinite', display: 'inline-block', marginBottom: 12 }}>✦</div>
                      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>
                        {garment.status === 'uploading' ? 'Uploading image…' : 'Claude AI is analysing your garment…'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Detecting fabric, silhouette, colour and occasion…</div>
                    </div>
                  ) : editingId === garment.id ? (
                    <EditGarmentForm garment={garment} onSave={patch => saveGarment(garment.id, patch)} onCancel={() => setEditingId(null)} />
                  ) : (
                    <GarmentView garment={garment} onEdit={() => setEditingId(garment.id)} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── ENQUIRIES ── */}
          {tab === 'enquiries' && (
            <div className="card">
              <div className="card-head"><span style={{ fontSize: 13, fontWeight: 600 }}>Enquiries & orders</span><span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{enquiries.length} total · {unread} unread</span></div>
              {enquiries.length === 0 ? (
                <EmptyState icon="✉" title="No enquiries yet" message="Share your portfolio link to start receiving enquiries and orders." />
              ) : enquiries.map(e => (
                <div key={e.id} onClick={() => markRead(e.id)}
                  style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 12, background: e.read ? 'transparent' : 'var(--brand-pale)', cursor: e.read ? 'default' : 'pointer', transition: 'background .2s' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: e.read ? 'transparent' : 'var(--brand)', marginTop: 6, flexShrink: 0 }} />
                  <Avatar name={e.from_name} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{e.from_name}</span>
                      <StatusBadge status={e.type} />
                    </div>
                    {e.garment_name && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>{e.garment_name}{e.size ? ` · Size ${e.size}` : ''}</div>}
                    <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5, marginBottom: 10 }}>{e.message}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {e.from_phone && <a href={`https://wa.me/${e.from_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#E8F5ED', borderColor: '#52B27A', color: 'var(--green-fg)' }}>Reply on WhatsApp</a>}
                      {e.from_email && <a href={`mailto:${e.from_email}`} className="btn btn-sm" style={{ background: 'var(--purple-bg)', borderColor: '#9B87F5', color: 'var(--purple-fg)' }}>Reply by email</a>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── WEBSITE ── */}
          {tab === 'website' && (
            <div className="card">
              <div className="card-head">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>My portfolio website</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{learner.status === 'published' ? 'Live and shareable' : 'Awaiting publish from your coordinator'}</div>
                </div>
                {learner.status === 'published' && learner.slug && (
                  <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#E8F5ED', borderColor: '#52B27A', color: 'var(--green-fg)' }}>View portfolio ↗</a>
                )}
              </div>

              {learner.status === 'published' && learner.slug ? (
                <div style={{ padding: 18 }}>
                  <div style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 3 }}>Your portfolio URL</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--blue-fg)' }}>{window.location.origin}/portfolio/{learner.slug}</div>
                    </div>
                    <button className="btn btn-default btn-sm" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/portfolio/${learner.slug}`); toast('Link copied!', 'success') }}>Copy link</button>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-600)', marginBottom: 10 }}>Share on</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`Check out my fashion portfolio: ${window.location.origin}/portfolio/${learner.slug}`)}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#E8F5ED', borderColor: '#52B27A', color: 'var(--green-fg)' }}>Share on WhatsApp</a>
                    <a href={`https://www.instagram.com/`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: 'var(--brand-light)', borderColor: 'var(--brand)', color: 'var(--brand-dark)' }}>Open Instagram</a>
                  </div>
                  <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--gray-100)' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-600)', marginBottom: 4 }}>Published garments</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
                      {garments.filter(g => g.status === 'published').map((g, i) => (
                        <GarmentThumb key={g.id} garment={g} index={i} />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🎨</div>
                  <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--gray-700)', marginBottom: 6 }}>Your portfolio isn't live yet</div>
                  <p style={{ fontSize: 13, color: 'var(--gray-400)', lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>Once your garments are reviewed and approved, your Skillinabox coordinator will publish your portfolio with one click.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Garment read view ────────────────────────────────────────
function GarmentView({ garment, onEdit }) {
  return (
    <>
      <div className="card-head">
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{garment.name || 'Garment details'}</div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{garment.category}{garment.fabric ? ` · ${garment.fabric}` : ''}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={garment.status} />
          <button className="btn btn-default btn-sm" onClick={onEdit}>Edit details</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: garment.image_url ? '160px 1fr' : '1fr' }}>
        {garment.image_url && (
          <div style={{ padding: 14, borderRight: '1px solid var(--gray-100)' }}>
            <img src={garment.image_url} alt="" style={{ width: '100%', borderRadius: 8, objectFit: 'cover', aspectRatio: '3/4', display: 'block' }} />
          </div>
        )}
        <div style={{ padding: 16 }}>
          {[['Price', garment.price ? `₹${Number(garment.price).toLocaleString('en-IN')}` : 'Not set'], ['Availability', garment.availability], ['Sizes', garment.sizes], ['Occasion', garment.occasion], ['Colour', garment.colour]].map(([l, v]) => (
            v ? <div key={l} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 2 }}>{l}</div>
              <div style={{ fontSize: 13, color: 'var(--gray-800)', fontWeight: l === 'Price' ? 600 : 400 }}>{v}</div>
            </div> : null
          ))}
          {garment.description && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6 }}>{garment.description}</div>}
          {!garment.price && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--amber-fg)', background: 'var(--amber-bg)', padding: '6px 12px', borderRadius: 'var(--radius-md)', display: 'inline-block' }}>Set a price to show this on your portfolio</div>}
        </div>
      </div>
    </>
  )
}

// ─── Garment edit form ────────────────────────────────────────
function EditGarmentForm({ garment, onSave, onCancel }) {
  const [f, setF] = useState({ name: garment.name, price: garment.price, description: garment.description, availability: garment.availability, sizes: garment.sizes })
  const upd = (k, v) => setF(p => ({ ...p, [k]: v }))

  return (
    <>
      <div className="card-head">
        <span style={{ fontSize: 14, fontWeight: 600 }}>Edit garment details</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-default btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={() => onSave(f)}>Save changes</button>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Your details to set</div>
        {[['Garment name', 'name'], ['Price (₹)', 'price'], ['Description', 'description'], ['Availability', 'availability'], ['Sizes available', 'sizes']].map(([l, k]) => (
          <FieldRow key={k} label={l} value={f[k]} onChange={v => upd(k, v)} />
        ))}
      </div>
    </>
  )
}

// Utility: file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
