import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, uploadGarmentImage, tagGarment, makeSlug, fileToBase64 } from '../lib/supabase'
import { useAuth } from '../App'
import { SIBLogo, Avatar, StatusBadge, FieldRow, GarmentThumb, Modal, Empty, Spinner, useToast } from '../components/ui'

const POSES = ['Front','Back','3/4 Left','3/4 Right','Seated','Walking','Close-up','Detail']
const POSE_COLORS = [['#FEF0EA','#C94E1E'],['#E6F4EC','#0D6B3A'],['#F0EFFE','#5B21B6'],['#FEF3E2','#92400E'],['#EFF6FF','#1D4ED8'],['#F0FDF4','#166534'],['#FFF7ED','#9A3412'],['#F5F3FF','#4C1D95']]

export default function Admin() {
  const { signOut } = useAuth()
  const toast = useToast()
  const [learners, setLearners]     = useState([])
  const [selLid, setSelLid]         = useState(null)
  const [garments, setGarments]     = useState([])
  const [selGid, setSelGid]         = useState(null)
  const [enquiries, setEnquiries]   = useState([])
  const [loadingL, setLoadingL]     = useState(true)
  const [loadingG, setLoadingG]     = useState(false)
  const [search, setSearch]         = useState('')
  const [showAdd, setShowAdd]       = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [showPubConfirm, setPub]    = useState(false)
  const [tab, setTab]               = useState('garments')
  const fileRef = useRef()

  const learner = learners.find(l=>l.id===selLid)
  const garment = garments.find(g=>g.id===selGid)

  useEffect(() => { loadLearners() }, [])
  useEffect(() => { if (selLid) { loadGarments(selLid); loadEnquiries(selLid) } }, [selLid])

  async function loadLearners() {
    setLoadingL(true)
    const { data } = await supabase.from('learners').select('*').order('created_at', { ascending:false })
    setLearners(data||[])
    setLoadingL(false)
  }

  async function loadGarments(lid) {
    setLoadingG(true)
    const { data } = await supabase.from('garments').select('*').eq('learner_id', lid).order('created_at')
    setGarments(data||[])
    if (data?.length && !selGid) setSelGid(data[0].id)
    setLoadingG(false)
  }

  async function loadEnquiries(lid) {
    const { data } = await supabase.from('enquiries').select('*').eq('learner_id', lid).order('created_at', { ascending:false })
    setEnquiries(data||[])
  }

  const mutL = useCallback(fn => setLearners(fn), [])
  const mutG = useCallback(fn => setGarments(fn), [])

  async function updateLearner(id, patch) {
    mutL(ls=>ls.map(l=>l.id===id?{...l,...patch}:l))
    await supabase.from('learners').update(patch).eq('id', id)
  }

  async function updateGarment(field, value) {
    if (!selGid) return
    mutG(gs=>gs.map(g=>g.id===selGid?{...g,[field]:value}:g))
    await supabase.from('garments').update({ [field]:value }).eq('id', selGid)
  }

  async function handleUpload(file) {
    if (!file||!selLid) return
    const { data:g, error } = await supabase.from('garments').insert({ learner_id:selLid, status:'uploading', name:file.name.replace(/\.[^.]+$/,'') }).select().single()
    if (error) { toast('Upload failed','error'); return }
    mutG(gs=>[...gs, g])
    setSelGid(g.id)
    if (learner?.status==='new') { await updateLearner(selLid, { status:'in-progress' }) }

    try {
      const imageUrl = await uploadGarmentImage(selLid, g.id, file)
      mutG(gs=>gs.map(x=>x.id===g.id?{...x,image_url:imageUrl,status:'tagging'}:x))
      await supabase.from('garments').update({ image_url:imageUrl, status:'tagging' }).eq('id', g.id)

      const base64 = await fileToBase64(file)
      const tags = await tagGarment(base64, file.type)
      const updates = { ...tags, name:tags.name||file.name.replace(/\.[^.]+$/,''), status:'tagged', ai_tagged:true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      mutG(gs=>gs.map(x=>x.id===g.id?{...x,...updates}:x))
      toast('Garment tagged by AI ✓','success')
    } catch {
      await supabase.from('garments').update({ status:'tagged' }).eq('id', g.id)
      mutG(gs=>gs.map(x=>x.id===g.id?{...x,status:'tagged'}:x))
      toast('Uploaded — fill details manually')
    }
  }

  async function handlePublish() {
    if (!learner) return
    setPublishing(true); setPub(false)
    const slug = makeSlug(learner.brand||learner.name)
    const toPublish = garments.filter(g=>['tagged','ready'].includes(g.status))
    if (toPublish.length) {
      await supabase.from('garments').update({ status:'published' }).in('id', toPublish.map(g=>g.id))
      mutG(gs=>gs.map(g=>toPublish.find(p=>p.id===g.id)?{...g,status:'published'}:g))
    }
    await supabase.from('learners').update({ status:'published', slug }).eq('id', selLid)
    mutL(ls=>ls.map(l=>l.id===selLid?{...l,status:'published',slug}:l))
    setPublishing(false)
    toast(`Portfolio live at /portfolio/${slug}`,'success')
  }

  async function addLearner(form) {
    const { data, error } = await supabase.from('learners').insert({ name:form.name, email:form.email, brand:form.brand, phone:form.phone }).select().single()
    if (error) { toast(error.message,'error'); return }
    mutL(ls=>[data,...ls])
    setShowAdd(false)
    setSelLid(data.id); setSelGid(null); setGarments([])
    toast(`${form.name} added. Share the login URL with them.`,'success')
  }

  const counts = { published:0,'in-progress':0,new:0 }
  learners.forEach(l=>{ if(counts[l.status]!==undefined) counts[l.status]++ })
  const filtered = learners.filter(l=>l.name.toLowerCase().includes(search.toLowerCase())||(l.brand||'').toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="layout">
      {/* Topbar */}
      <header className="topbar">
        <SIBLogo dark={true} />
        <div style={{ width:1, height:24, background:'#2E2E2E', margin:'0 8px' }} />
        <span style={{ fontSize:11, color:'#555', background:'#1A1A1A', padding:'2px 8px', borderRadius:99, border:'1px solid #2E2E2E' }}>Admin</span>
        <div style={{ display:'flex', gap:20, marginLeft:20 }}>
          {[['Published',counts.published,'#0D6B3A'],['In progress',counts['in-progress'],'#92400E'],['New',counts.new,'#555']].map(([l,v,c])=>(
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:600, color:c }}>{v}</div>
              <div style={{ fontSize:10, color:'#444' }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {learner?.status==='published'&&learner?.slug && (
            <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ color:'#888', fontSize:12 }}>View site ↗</a>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color:'#888' }} onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="sidebar">
        <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid #2E2E2E' }}>
          <div style={{ display:'flex', gap:8, marginBottom:6 }}>
            <input className="input input-dark" style={{ flex:1, fontSize:13, padding:'7px 10px' }} placeholder="Search learners…" value={search} onChange={e=>setSearch(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>+ Add</button>
          </div>
          <div style={{ fontSize:11, color:'#555' }}>{filtered.length} learner{filtered.length!==1?'s':''}</div>
        </div>

        {loadingL ? (
          <div style={{ padding:32, textAlign:'center' }}><Spinner color="#F4622A" /></div>
        ) : filtered.length===0 ? (
          <Empty icon="👩" title="No learners yet" message="Add your first learner" action={<button className="btn btn-primary btn-sm" onClick={()=>setShowAdd(true)}>+ Add learner</button>} />
        ) : (
          <div style={{ overflowY:'auto', flex:1 }}>
            {filtered.map(l=>(
              <div key={l.id} className={`nav-item ${selLid===l.id?'active':''}`} onClick={()=>{setSelLid(l.id);setSelGid(null);setGarments([]);setTab('garments')}}>
                <Avatar name={l.name} size={28} />
                <div style={{ minWidth:0 }}>
                  <div className="nav-label" style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                  <div className="nav-sub">{l.brand||'No brand'} · <StatusBadge status={l.status}/></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Main */}
      <main className="main" style={{ background:'var(--bg)' }}>
        {!learner ? (
          <Empty icon="←" title="Select a learner" message="Choose a learner from the sidebar to manage their portfolio." />
        ) : (
          <div style={{ maxWidth:880, display:'flex', flexDirection:'column', gap:16 }}>
            {/* Learner header */}
            <div className="card">
              <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
                <Avatar name={learner.name} size={44} />
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:16, fontWeight:600 }}>{learner.name}</span>
                    <StatusBadge status={learner.status}/>
                  </div>
                  <div style={{ fontSize:12, color:'var(--mid)', marginTop:3 }}>{learner.brand||'No brand'} · {learner.email} · {learner.phone||'No phone'}</div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className={`btn btn-publish ${publishing?'pulse':''}`} disabled={publishing||garments.length===0} onClick={()=>setPub(true)}>
                    {publishing ? <><Spinner size={14} color="#fff"/>Publishing…</> : <>{learner.status==='published'?'↻ Republish':'↗ Publish portfolio'}</>}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display:'flex', borderTop:'1px solid var(--border)', padding:'0 18px' }}>
                {[['garments',`Garments (${garments.length})`],['enquiries',`Enquiries (${enquiries.length})`],['profile','Profile']].map(([t,l])=>(
                  <button key={t} onClick={()=>setTab(t)} style={{ padding:'10px 16px', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'var(--orange)':'var(--mid)', background:'none', border:'none', borderBottom:tab===t?'2px solid var(--orange)':'2px solid transparent', cursor:'pointer', marginBottom:-1 }}>{l}</button>
                ))}
              </div>
            </div>

            {/* GARMENTS TAB */}
            {tab==='garments' && (
              <>
                <div className="card">
                  <div className="card-head">
                    <div><div className="card-title">Garment photos</div><div className="card-sub">Upload a photo — AI auto-tags everything</div></div>
                    <button className="btn btn-primary btn-sm" onClick={()=>fileRef.current?.click()}>+ Upload garment</button>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleUpload(e.target.files[0]); e.target.value='' }} />
                  </div>
                  {loadingG ? (
                    <div style={{ padding:32, textAlign:'center' }}><Spinner/></div>
                  ) : garments.length===0 ? (
                    <Empty icon="📷" title="No garments yet" message="Upload a garment photo to start." action={<button className="btn btn-primary" onClick={()=>fileRef.current?.click()}>Upload first garment</button>} />
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, padding:14 }}>
                      {garments.map((g,i)=><GarmentThumb key={g.id} garment={g} index={i} selected={selGid===g.id} onClick={()=>setSelGid(g.id)}/>)}
                    </div>
                  )}
                </div>

                {garment && (
                  <div className="card anim-in">
                    <div className="card-head">
                      <div>
                        <div className="card-title">{garment.name||'Garment details'}</div>
                        <div className="card-sub">{garment.status==='tagging'?'Claude AI is analysing…':garment.ai_tagged?'AI auto-filled — all fields editable':'Fill in the details'}</div>
                      </div>
                      <StatusBadge status={garment.status}/>
                    </div>

                    {garment.status==='tagging'||garment.status==='uploading' ? (
                      <div style={{ padding:'48px 20px', textAlign:'center' }}>
                        <div style={{ fontSize:32, color:'var(--orange)', marginBottom:12 }} className="spin">✦</div>
                        <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>{garment.status==='uploading'?'Uploading image…':'Claude AI is reading the garment…'}</div>
                        <div style={{ fontSize:13, color:'var(--mid)' }}>Detecting fabric, silhouette, colour and occasion…</div>
                      </div>
                    ) : (
                      <div style={{ display:'grid', gridTemplateColumns:garment.image_url?'170px 1fr':'1fr' }}>
                        {garment.image_url && (
                          <div style={{ padding:14, borderRight:'1px solid var(--border)' }}>
                            <img src={garment.image_url} alt="" style={{ width:'100%', borderRadius:8, objectFit:'cover', aspectRatio:'3/4', display:'block' }}/>
                          </div>
                        )}
                        <div style={{ padding:16 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:'var(--mid)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>AI-detected details</div>
                          {[['Garment name','name'],['Category','category'],['Fabric','fabric'],['Key features','features'],['Colour','colour'],['Occasion','occasion']].map(([l,f])=>(
                            <FieldRow key={f} label={l} value={garment[f]} onChange={v=>updateGarment(f,v)} aiTagged={garment.ai_tagged}/>
                          ))}
                          <div style={{ fontSize:11, fontWeight:600, color:'var(--mid)', textTransform:'uppercase', letterSpacing:'.05em', margin:'14px 0 10px' }}>Pricing & availability</div>
                          {[['Price (₹)','price'],['Sizes','sizes'],['Availability','availability'],['Description','description']].map(([l,f])=>(
                            <FieldRow key={f} label={l} value={garment[f]} onChange={v=>updateGarment(f,v)}/>
                          ))}
                        </div>
                      </div>
                    )}

                    {['tagged','ready','published'].includes(garment.status) && (
                      <div style={{ borderTop:'1px solid var(--border)', padding:14 }}>
                        <div style={{ fontSize:11, fontWeight:600, color:'var(--mid)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
                          AI pose slots · <span style={{ color:'var(--orange)', textTransform:'none', fontWeight:400, letterSpacing:0 }}>AI platform to be connected</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          {POSES.map((p,i)=>(
                            <div key={p} style={{ textAlign:'center' }}>
                              <div style={{ width:54, height:70, borderRadius:7, background:POSE_COLORS[i][0], display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, border:'1px solid var(--border)' }}>
                                {['👗','🔄','↖','↗','🪑','🚶','🔍','✦'][i]}
                              </div>
                              <div style={{ fontSize:10, color:'var(--mid)', marginTop:3 }}>{p}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ENQUIRIES TAB */}
            {tab==='enquiries' && (
              <div className="card">
                <div className="card-head"><div className="card-title">Enquiries & orders</div></div>
                {enquiries.length===0 ? (
                  <Empty icon="✉" title="No enquiries yet" message="Enquiries from the portfolio website appear here."/>
                ) : enquiries.map(e=>(
                  <div key={e.id} style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', gap:12 }}>
                    <Avatar name={e.from_name} size={34}/>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                        <span style={{ fontSize:14, fontWeight:600 }}>{e.from_name}</span>
                        <StatusBadge status={e.type}/>
                        {!e.read && <span style={{ width:7, height:7, borderRadius:'50%', background:'var(--orange)', display:'inline-block' }}/>}
                      </div>
                      {e.garment_name && <div style={{ fontSize:12, color:'var(--mid)', marginBottom:4 }}>{e.garment_name}{e.size?` · Size ${e.size}`:''}</div>}
                      <div style={{ fontSize:13, color:'var(--dark-3)', lineHeight:1.5 }}>{e.message}</div>
                      <div style={{ display:'flex', gap:8, marginTop:10 }}>
                        {e.from_phone && <a href={`https://wa.me/${e.from_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background:'#E6F4EC', borderColor:'#52B27A', color:'var(--green-fg)' }}>WhatsApp</a>}
                        {e.from_email && <a href={`mailto:${e.from_email}`} className="btn btn-sm" style={{ background:'var(--purple-bg)', borderColor:'#9B87F5', color:'var(--purple-fg)' }}>Email</a>}
                      </div>
                    </div>
                    <span style={{ fontSize:11, color:'var(--mid)', whiteSpace:'nowrap' }}>{new Date(e.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                  </div>
                ))}
              </div>
            )}

            {/* PROFILE TAB */}
            {tab==='profile' && (
              <div className="card">
                <div className="card-head"><div className="card-title">Learner profile</div></div>
                <div style={{ padding:18, display:'flex', flexDirection:'column', gap:8 }}>
                  {[['Full name','name'],['Brand name','brand'],['Email','email'],['Phone','phone'],['Tagline','tagline'],['Instagram','instagram']].map(([l,f])=>(
                    <FieldRow key={f} label={l} value={learner[f]} onChange={v=>updateLearner(selLid,{[f]:v})}/>
                  ))}
                  <div style={{ marginTop:8, padding:'10px 14px', background:'var(--orange-light)', borderRadius:'var(--r-md)', fontSize:12, color:'var(--orange-dark)' }}>
                    Learner sign-up link: <strong>{window.location.origin}/login</strong> — they must use {learner.email} to sign up.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showAdd && <AddLearnerModal onAdd={addLearner} onClose={()=>setShowAdd(false)}/>}

      {showPubConfirm && (
        <Modal title="Publish portfolio" onClose={()=>setPub(false)} width={420}>
          <p style={{ fontSize:14, color:'var(--mid)', lineHeight:1.6, marginBottom:20 }}>
            This will publish all tagged garments and make <strong>{learner?.name}</strong>'s portfolio live at <strong>/portfolio/{makeSlug(learner?.brand||learner?.name)}</strong>.
          </p>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button className="btn btn-default" onClick={()=>setPub(false)}>Cancel</button>
            <button className="btn btn-publish" onClick={handlePublish}>Yes, publish website ↗</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function AddLearnerModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:'', email:'', brand:'', phone:'' })
  const [loading, setLoading] = useState(false)
  const upd = (k,v) => setForm(p=>({...p,[k]:v}))

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()||!form.email.trim()) return
    setLoading(true)
    await onAdd(form)
    setLoading(false)
  }

  return (
    <Modal title="Add new learner" onClose={onClose} width={420}>
      <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {[['Full name *','name','text'],['Email address *','email','email'],['Brand name','brand','text'],['Phone number','phone','tel']].map(([l,k,t])=>(
          <div key={k}>
            <label className="label">{l}</label>
            <input className="input" type={t} value={form[k]} onChange={e=>upd(k,e.target.value)} placeholder={l.replace(' *','')} required={l.includes('*')}/>
          </div>
        ))}
        <div style={{ padding:'10px 12px', background:'var(--orange-light)', borderRadius:'var(--r-md)', fontSize:12, color:'var(--orange-dark)', marginTop:4 }}>
          After adding, share <strong>{window.location.origin}/login</strong> with the learner. They sign up using this exact email.
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:8 }}>
          <button type="button" className="btn btn-default" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Spinner size={14} color="#fff"/> : 'Add learner'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
