import { useState, useEffect, useRef } from 'react'
import { supabase, uploadGarmentImage, tagGarment, makeSlug } from '../lib/supabase'
import { useAuth } from '../App'
import { Avatar, StatusBadge, FieldRow, GarmentThumb, Modal, Confirm, EmptyState, Spinner, useToast } from '../components/ui'

const POSE_LABELS = ['Front', 'Back', '3/4 Left', '3/4 Right', 'Seated', 'Walking', 'Close-up', 'Detail']

export default function Admin() {
  const { signOut } = useAuth()
  const toast = useToast()
  const [learners, setLearners]       = useState([])
  const [selLid, setSelLid]           = useState(null)
  const [garments, setGarments]       = useState([])
  const [selGid, setSelGid]           = useState(null)
  const [enquiries, setEnquiries]     = useState([])
  const [loadingL, setLoadingL]       = useState(true)
  const [loadingG, setLoadingG]       = useState(false)
  const [search, setSearch]           = useState('')
  const [showAddLearner, setAddL]     = useState(false)
  const [showPublishConfirm, setPub]  = useState(false)
  const [publishing, setPublishing]   = useState(false)
  const [tab, setTab]                 = useState('garments') // garments | enquiries | profile
  const fileRef = useRef()

  const learner = learners.find(l => l.id === selLid)
  const garment = garments.find(g => g.id === selGid)

  // Load learners
  useEffect(() => {
    loadLearners()
    // Real-time: refresh on garment changes
    const sub = supabase.channel('admin').on('postgres_changes', { event: '*', schema: 'public', table: 'garments' }, () => loadGarments(selLid)).subscribe()
    return () => sub.unsubscribe()
  }, [])

  useEffect(() => { if (selLid) { loadGarments(selLid); loadEnquiries(selLid) } }, [selLid])

  async function loadLearners() {
    setLoadingL(true)
    const { data } = await supabase.from('learners').select('*').order('created_at', { ascending: false })
    setLearners(data || [])
    setLoadingL(false)
  }

  async function loadGarments(lid) {
    if (!lid) return
    setLoadingG(true)
    const { data } = await supabase.from('garments').select('*').eq('learner_id', lid).order('created_at')
    setGarments(data || [])
    if (data?.length && !selGid) setSelGid(data[0].id)
    setLoadingG(false)
  }

  async function loadEnquiries(lid) {
    const { data } = await supabase.from('enquiries').select('*').eq('learner_id', lid).order('created_at', { ascending: false })
    setEnquiries(data || [])
  }

  function selectLearner(lid) {
    setSelLid(lid); setSelGid(null); setGarments([]); setTab('garments')
  }

  // Upload + AI tag garment
  async function handleUpload(file) {
    if (!file || !selLid) return
    // 1. Insert stub garment
    const { data: g, error } = await supabase.from('garments').insert({ learner_id: selLid, status: 'uploading', name: file.name.replace(/\.[^.]+$/, '') }).select().single()
    if (error) { toast('Upload failed', 'error'); return }
    setGarments(prev => [...prev, g])
    setSelGid(g.id)

    try {
      // 2. Upload image
      const imageUrl = await uploadGarmentImage(selLid, g.id, file)
      await supabase.from('garments').update({ image_url: imageUrl, status: 'tagging' }).eq('id', g.id)
      setGarments(prev => prev.map(x => x.id === g.id ? { ...x, image_url: imageUrl, status: 'tagging' } : x))

      // 3. Convert to base64 and tag
      const base64 = await fileToBase64(file)
      const tags = await tagGarment(base64, file.type)

      // 4. Save tags
      const updates = { ...tags, status: 'tagged', ai_tagged: true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      setGarments(prev => prev.map(x => x.id === g.id ? { ...x, ...updates } : x))

      // Update learner status
      if (learner?.status === 'new') {
        await supabase.from('learners').update({ status: 'in-progress' }).eq('id', selLid)
        setLearners(prev => prev.map(l => l.id === selLid ? { ...l, status: 'in-progress' } : l))
      }
      toast('Garment tagged successfully', 'success')
    } catch (err) {
      await supabase.from('garments').update({ status: 'tagged' }).eq('id', g.id)
      setGarments(prev => prev.map(x => x.id === g.id ? { ...x, status: 'tagged' } : x))
      toast('AI tagging failed — fill details manually', 'error')
    }
  }

  // Update garment field
  async function updateGarment(field, value) {
    if (!selGid) return
    setGarments(prev => prev.map(g => g.id === selGid ? { ...g, [field]: value } : g))
    await supabase.from('garments').update({ [field]: value }).eq('id', selGid)
  }

  // Update learner field
  async function updateLearner(field, value) {
    if (!selLid) return
    setLearners(prev => prev.map(l => l.id === selLid ? { ...l, [field]: value } : l))
    await supabase.from('learners').update({ [field]: value }).eq('id', selLid)
  }

  // Publish portfolio
  async function handlePublish() {
    setPublishing(true); setPub(false)
    const slug = makeSlug(learner.brand || learner.name)
    // Publish all tagged/ready garments
    const toPublish = garments.filter(g => ['tagged', 'ready'].includes(g.status))
    if (toPublish.length) {
      await supabase.from('garments').update({ status: 'published' }).in('id', toPublish.map(g => g.id))
      setGarments(prev => prev.map(g => toPublish.find(p => p.id === g.id) ? { ...g, status: 'published' } : g))
    }
    await supabase.from('learners').update({ status: 'published', slug }).eq('id', selLid)
    setLearners(prev => prev.map(l => l.id === selLid ? { ...l, status: 'published', slug } : l))
    setPublishing(false)
    toast(`Portfolio published at /portfolio/${slug}`, 'success')
  }

  // Add learner
  async function handleAddLearner(form) {
    const { data, error } = await supabase.from('learners').insert({ name: form.name, email: form.email, brand: form.brand, phone: form.phone }).select().single()
    if (error) { toast(error.message, 'error'); return }
    setLearners(prev => [data, ...prev])
    setAddL(false)
    toast(`Learner added. Share the platform link with ${form.name} — they sign up with ${form.email}.`, 'success')
    selectLearner(data.id)
  }

  // Counts
  const counts = { published: 0, 'in-progress': 0, new: 0 }
  learners.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++ })
  const filtered = learners.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    (l.brand || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="app-layout">
      {/* Top bar */}
      <header className="app-topbar">
        <span style={{ fontSize: 20, color: 'var(--brand)' }}>✦</span>
        <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 16, fontWeight: 400 }}>Skillinabox</span>
        <span style={{ fontSize: 12, color: 'var(--gray-400)', background: 'var(--gray-100)', padding: '2px 8px', borderRadius: 99 }}>Admin</span>
        <div style={{ display: 'flex', gap: 24, marginLeft: 24 }}>
          {[['Published', counts.published, 'var(--green-fg)'], ['In progress', counts['in-progress'], 'var(--amber-fg)'], ['New', counts.new, 'var(--gray-400)']].map(([l, v, c]) => (
            <div key={l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: c }}>{v}</div>
              <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {learner?.status === 'published' && learner?.slug && (
            <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" className="btn btn-default btn-sm">View site ↗</a>
          )}
          <button className="btn btn-default btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="app-sidebar">
        <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid var(--gray-100)' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input className="input" style={{ flex: 1, fontSize: 13, padding: '7px 10px' }} placeholder="Search learners…" value={search} onChange={e => setSearch(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={() => setAddL(true)}>+ Add</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{filtered.length} learner{filtered.length !== 1 ? 's' : ''}</div>
        </div>

        {loadingL ? (
          <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="👩" title="No learners yet" message="Add your first learner to get started." action={<button className="btn btn-primary btn-sm" onClick={() => setAddL(true)}>+ Add learner</button>} />
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {filtered.map(l => (
              <div key={l.id} onClick={() => selectLearner(l.id)}
                style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)', borderLeft: `3px solid ${selLid === l.id ? 'var(--brand)' : 'transparent'}`, background: selLid === l.id ? 'var(--brand-pale)' : 'transparent', transition: 'background .12s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Avatar name={l.name} size={30} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                      {l.brand || 'No brand'} · <StatusBadge status={l.status} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="app-main">
        {!learner ? (
          <EmptyState icon="←" title="Select a learner" message="Choose a learner from the sidebar to view and manage their portfolio." />
        ) : (
          <div style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Learner header */}
            <div className="card">
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar name={learner.name} size={44} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-900)' }}>{learner.name}</span>
                    <StatusBadge status={learner.status} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 3 }}>{learner.brand || 'No brand'} · {learner.email} · {learner.phone || 'No phone'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className={`btn btn-publish ${publishing ? 'animate-pulse' : ''}`} disabled={publishing || garments.length === 0} onClick={() => setPub(true)}>
                    {publishing ? <><Spinner size={14} color="#fff" /> Publishing…</> : <>{learner.status === 'published' ? '↻ Republish' : '↗ Generate & publish website'}</>}
                  </button>
                </div>
              </div>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: 0, borderTop: '1px solid var(--gray-100)', padding: '0 18px' }}>
                {[['garments', `Garments (${garments.length})`], ['enquiries', `Enquiries (${enquiries.length})`], ['profile', 'Profile']].map(([t, l]) => (
                  <button key={t} onClick={() => setTab(t)} style={{ padding: '10px 16px', fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? 'var(--brand)' : 'var(--gray-500)', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid var(--brand)' : '2px solid transparent', cursor: 'pointer', marginBottom: -1 }}>{l}</button>
                ))}
              </div>
            </div>

            {/* ── GARMENTS TAB ── */}
            {tab === 'garments' && (
              <>
                <div className="card">
                  <div className="card-head">
                    <span style={{ fontSize: 13, fontWeight: 600 }}>Garment photos</span>
                    <button className="btn btn-default btn-sm" onClick={() => fileRef.current?.click()}>+ Upload garment</button>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleUpload(e.target.files[0]); e.target.value = '' }} />
                  </div>
                  {loadingG ? (
                    <div style={{ padding: 32, textAlign: 'center' }}><Spinner /></div>
                  ) : garments.length === 0 ? (
                    <EmptyState icon="📷" title="No garments yet" message="Upload a garment photo to start — AI will auto-tag it." action={<button className="btn btn-primary" onClick={() => fileRef.current?.click()}>Upload first garment</button>} />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, padding: 14 }}>
                      {garments.map((g, i) => (
                        <GarmentThumb key={g.id} garment={g} index={i} selected={selGid === g.id} onClick={() => setSelGid(g.id)} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Garment detail */}
                {garment && (
                  <div className="card animate-in">
                    <div className="card-head">
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{garment.name || 'Garment details'}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>
                          {garment.status === 'tagging' ? 'Claude AI is reading the garment…' : garment.ai_tagged ? 'AI auto-filled · all fields editable' : 'Fill in the details'}
                        </div>
                      </div>
                      <StatusBadge status={garment.status} />
                    </div>

                    {garment.status === 'tagging' ? (
                      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                        <div style={{ fontSize: 36, color: 'var(--brand)', animation: 'spin 2s linear infinite', display: 'inline-block', marginBottom: 12 }}>✦</div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gray-700)', marginBottom: 6 }}>Analysing garment with Claude AI</div>
                        <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>Detecting fabric, silhouette, colour and occasion…</div>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: garment.image_url ? '160px 1fr' : '1fr', gap: 0 }}>
                        {garment.image_url && (
                          <div style={{ padding: 14, borderRight: '1px solid var(--gray-100)' }}>
                            <img src={garment.image_url} alt="" style={{ width: '100%', borderRadius: 8, objectFit: 'cover', aspectRatio: '3/4', display: 'block' }} />
                          </div>
                        )}
                        <div style={{ padding: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>AI-detected details</div>
                          {[['Garment name', 'name'], ['Category', 'category'], ['Fabric', 'fabric'], ['Key features', 'features'], ['Colour', 'colour'], ['Occasion', 'occasion']].map(([l, f]) => (
                            <FieldRow key={f} label={l} value={garment[f]} onChange={v => updateGarment(f, v)} aiTagged={garment.ai_tagged} />
                          ))}
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.05em', margin: '14px 0 10px' }}>Pricing & availability</div>
                          {[['Price (₹)', 'price'], ['Sizes', 'sizes'], ['Availability', 'availability'], ['Description', 'description']].map(([l, f]) => (
                            <FieldRow key={f} label={l} value={garment[f]} onChange={v => updateGarment(f, v)} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Pose slots */}
                    {['tagged', 'ready', 'published'].includes(garment.status) && (
                      <div style={{ borderTop: '1px solid var(--gray-100)', padding: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>
                          AI pose slots · <span style={{ color: 'var(--brand)', textTransform: 'none', fontWeight: 400, letterSpacing: 0 }}>AI platform to be connected</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {POSE_LABELS.map((p, i) => (
                            <div key={p} style={{ textAlign: 'center' }}>
                              <div style={{ width: 54, height: 70, borderRadius: 7, background: ['#F7EEF1','#E8F5ED','#F0EFFE','#FEF3E2','#EFF6FF','#F0FDF4','#FDF4FF','#FFFBEB'][i], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, border: '1px solid var(--gray-200)' }}>
                                {['👗','🔄','↖','↗','🪑','🚶','🔍','✦'][i]}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 3 }}>{p}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ── ENQUIRIES TAB ── */}
            {tab === 'enquiries' && (
              <div className="card">
                <div className="card-head"><span style={{ fontSize: 13, fontWeight: 600 }}>Enquiries & orders</span></div>
                {enquiries.length === 0 ? (
                  <EmptyState icon="✉" title="No enquiries yet" message="Enquiries from the portfolio website appear here." />
                ) : enquiries.map(e => (
                  <div key={e.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--gray-100)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <Avatar name={e.from_name} size={34} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{e.from_name}</span>
                        <StatusBadge status={e.type} />
                        {!e.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand)', display: 'inline-block' }} />}
                      </div>
                      {e.garment_name && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 4 }}>{e.garment_name}{e.size ? ` · Size ${e.size}` : ''}</div>}
                      <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.5 }}>{e.message}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        {e.from_phone && <a href={`https://wa.me/${e.from_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#E8F5ED', borderColor: '#52B27A', color: 'var(--green-fg)' }}>WhatsApp</a>}
                        {e.from_email && <a href={`mailto:${e.from_email}`} className="btn btn-sm" style={{ background: 'var(--purple-bg)', borderColor: '#9B87F5', color: 'var(--purple-fg)' }}>Email</a>}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── PROFILE TAB ── */}
            {tab === 'profile' && (
              <div className="card">
                <div className="card-head"><span style={{ fontSize: 13, fontWeight: 600 }}>Learner profile</span></div>
                <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[['Full name', 'name'], ['Brand name', 'brand'], ['Email', 'email'], ['Phone', 'phone'], ['Tagline', 'tagline'], ['Instagram', 'instagram']].map(([l, f]) => (
                    <FieldRow key={f} label={l} value={learner[f]} onChange={v => updateLearner(f, v)} />
                  ))}
                  <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--gray-400)' }}>
                    Share this link so the learner can sign up: <strong>{window.location.origin}/login</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add learner modal */}
      {showAddLearner && <AddLearnerModal onAdd={handleAddLearner} onClose={() => setAddL(false)} />}

      {/* Publish confirm */}
      {showPublishConfirm && (
        <Confirm
          title="Publish portfolio"
          message={`This will publish all tagged garments and make ${learner?.name}'s portfolio live at /portfolio/${makeSlug(learner?.brand || learner?.name)}. Existing published garments will be updated.`}
          confirmLabel="Yes, publish website"
          onConfirm={handlePublish}
          onCancel={() => setPub(false)}
        />
      )}
    </div>
  )
}

// ─── Add Learner Modal ────────────────────────────────────────
function AddLearnerModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', brand: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.email.trim()) return
    setLoading(true)
    await onAdd(form)
    setLoading(false)
  }

  return (
    <Modal title="Add new learner" onClose={onClose} width={420}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[['Full name *', 'name', 'text'], ['Email address *', 'email', 'email'], ['Brand name', 'brand', 'text'], ['Phone number', 'phone', 'tel']].map(([l, k, t]) => (
          <div key={k}>
            <label className="label">{l}</label>
            <input className="input" type={t} value={form[k]} onChange={e => upd(k, e.target.value)} placeholder={l.replace(' *', '')} required={l.includes('*')} />
          </div>
        ))}
        <div style={{ padding: '10px 12px', background: 'var(--brand-pale)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--brand-dark)', marginTop: 4 }}>
          After adding, share the sign-up link with the learner. They sign up using this email address and their account is automatically linked.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Spinner size={14} color="#fff" /> : 'Add learner'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
