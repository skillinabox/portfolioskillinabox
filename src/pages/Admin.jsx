import { useState, useEffect, useRef } from 'react'
import { supabase, uploadGarmentImage, uploadProfileImage, tagGarment, generateCollectionDesc, generateGarmentDesc, makeSlug, fileToBase64 } from '../lib/supabase'
import { grantFreeTrial, getPlans, getActiveSubscription, getUsage, currentMonth } from '../lib/subscription'
import { useAuth } from '../App'
import { SIBLogo, Avatar, StatusBadge, GarmentThumb, Modal, Empty, Spinner, useToast } from '../components/ui'

const MEASUREMENT_FIELDS = ['Bust','Waist','Hips','Shoulder','Sleeve length','Front length','Back length','Inseam','Thigh','Calf']
const SEASONS = ['Any','Spring','Summer','Monsoon','Festive','Winter','Bridal']

function btn(v='default') {
  const base = { display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:500, borderRadius:8, border:'1px solid', cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', transition:'all .15s' }
  if (v==='primary') return { ...base, background:'#F4622A', borderColor:'#F4622A', color:'#fff' }
  if (v==='ghost')   return { ...base, background:'transparent', borderColor:'transparent', color:'#888' }
  return { ...base, background:'#fff', borderColor:'#E2E0DC', color:'#333' }
}
const card  = { background:'#fff', border:'1px solid #E8E6E2', borderRadius:12, overflow:'hidden' }
const chead = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'12px 16px', borderBottom:'1px solid #F0EEE9' }

export default function Admin() {
  const { signOut } = useAuth()
  const toast = useToast()

  const [learners,     setLearners]     = useState([])
  const [selLid,       setSelLid]       = useState(() => localStorage.getItem('snb_selLid') || null)
  const [collections,  setCollections]  = useState([])
  const [garments,     setGarments]     = useState([])
  const [enquiries,    setEnquiries]    = useState([])
  const [selGid,       setSelGid]       = useState(null)
  const [selEnqId,     setSelEnqId]     = useState(null)
  const [loadingL,     setLoadingL]     = useState(true)
  const [loadingG,     setLoadingG]     = useState(false)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('all') // all | published | in-progress | new | demo
  const [sortBy,       setSortBy]       = useState('name') // name | recent | status
  const [tab,          setTab]          = useState(() => localStorage.getItem('snb_tab') || 'garments')
  const [publishing,   setPublishing]   = useState(false)
  const [showAdd,      setShowAdd]      = useState(false)
  const [showAddCol,   setShowAddCol]   = useState(false)
  const [showPubConf,  setShowPubConf]  = useState(false)
  const [showPlans,    setShowPlans]    = useState(false)
  const [genningDesc,  setGenningDesc]  = useState(false)

  const fileRef  = useRef()
  const photoRef = useRef()
  const logoRef  = useRef()

  const learner  = learners.find(l => l.id === selLid)
  const garment  = garments.find(g => g.id === selGid)
  const selEnquiry = enquiries.find(e => e.id === selEnqId)

  useEffect(() => { loadLearners() }, [])
  useEffect(() => {
    if (selLid) {
      loadAll(selLid)
      localStorage.setItem('snb_selLid', selLid)
    }
  }, [selLid])
  useEffect(() => { localStorage.setItem('snb_tab', tab) }, [tab])

  async function loadLearners() {
    setLoadingL(true)
    const { data } = await supabase.from('learners').select('*').order('created_at', { ascending: false })
    setLearners(data || [])
    setLoadingL(false)
  }

  async function loadAll(lid) {
    setLoadingG(true)
    const [{ data: g }, { data: c }, { data: e }] = await Promise.all([
      supabase.from('garments').select('*').eq('learner_id', lid).order('created_at'),
      supabase.from('collections').select('*').eq('learner_id', lid).order('display_order'),
      supabase.from('enquiries').select('*').eq('learner_id', lid).order('created_at', { ascending: false }),
    ])
    setGarments(g || [])
    setCollections(c || [])
    setEnquiries(e || [])
    if (g?.length) setSelGid(g[0].id)
    setLoadingG(false)
  }

  const mutL = fn => setLearners(fn)
  const mutG = fn => setGarments(fn)
  const mutC = fn => setCollections(fn)

  async function updateLearner(patch) {
    if (!selLid) return
    mutL(ls => ls.map(l => l.id === selLid ? { ...l, ...patch } : l))
    await supabase.from('learners').update(patch).eq('id', selLid)
  }

  async function updateGarment(field, value) {
    if (!selGid) return
    mutG(gs => gs.map(g => g.id === selGid ? { ...g, [field]: value } : g))
    await supabase.from('garments').update({ [field]: value }).eq('id', selGid)
  }

  async function updateCollection(id, patch) {
    mutC(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
    await supabase.from('collections').update(patch).eq('id', id)
  }

  async function handleUpload(file) {
    if (!file || !selLid) return
    const { data: g, error } = await supabase.from('garments').insert({
      learner_id: selLid, status: 'uploading', name: file.name.replace(/\.[^.]+$/, '')
    }).select().single()
    if (error) { toast('Upload failed', 'error'); return }
    mutG(gs => [...gs, g]); setSelGid(g.id)
    if (learner?.status === 'new') updateLearner({ status: 'in-progress' })
    try {
      const imageUrl = await uploadGarmentImage(selLid, g.id, file)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, image_url: imageUrl, status: 'tagging' } : x))
      await supabase.from('garments').update({ image_url: imageUrl, status: 'tagging' }).eq('id', g.id)
      const base64 = await fileToBase64(file)
      const tags = await tagGarment(base64, file.type, learner?.is_demo || false)
      const updates = { ...tags, name: tags.name || file.name.replace(/\.[^.]+$/, ''), status: 'tagged', ai_tagged: true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, ...updates } : x))
      toast('LIA tagging done ✓', 'success')
    } catch {
      await supabase.from('garments').update({ status: 'tagged' }).eq('id', g.id)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, status: 'tagged' } : x))
      toast('Uploaded — fill details manually')
    }
  }

  async function handleProfileImg(file, type) {
    if (!file || !selLid) return
    try {
      const url = await uploadProfileImage(selLid, type, file)
      await updateLearner(type === 'photo' ? { photo_url: url } : { logo_url: url })
      toast(`${type === 'photo' ? 'Photo' : 'Logo'} updated ✓`, 'success')
    } catch { toast('Upload failed', 'error') }
  }

  async function handleGenGarmentDesc() {
    if (!garment) return
    setGenningDesc(true)
    try {
      const desc = await generateGarmentDesc(garment.name, garment.category, garment.fabric, garment.features, learner?.is_demo || false)
      await updateGarment('description', desc)
      toast('Description generated ✓', 'success')
    } catch { toast('Failed', 'error') }
    setGenningDesc(false)
  }

  async function handleGenColDesc(col) {
    const gNames = garments.filter(g => g.collection_id === col.id).map(g => g.name)
    try {
      const desc = await generateCollectionDesc(col.name, gNames, learner?.is_demo || false)
      await updateCollection(col.id, { description: desc })
      toast('Description generated ✓', 'success')
    } catch { toast('Failed', 'error') }
  }

  async function addCollection(form) {
    const { data, error } = await supabase.from('collections').insert({
      learner_id: selLid, name: form.name, season: form.season, year: form.year,
      display_order: collections.length
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    mutC(cs => [...cs, data])
    setShowAddCol(false)
    toast('Collection created!', 'success')
    const desc = await generateCollectionDesc(form.name, [], learner?.is_demo || false).catch(() => '')
    if (desc) { await updateCollection(data.id, { description: desc }) }
  }

  async function handlePublish() {
    if (!learner) return
    setPublishing(true); setShowPubConf(false)
    const slug = makeSlug(learner.brand || learner.name)
    const toPublish = garments.filter(g => ['tagged','ready'].includes(g.status))
    if (toPublish.length) {
      await supabase.from('garments').update({ status: 'published' }).in('id', toPublish.map(g => g.id))
      mutG(gs => gs.map(g => toPublish.find(p => p.id === g.id) ? { ...g, status: 'published' } : g))
    }
    await supabase.from('learners').update({ status: 'published', slug }).eq('id', selLid)
    mutL(ls => ls.map(l => l.id === selLid ? { ...l, status: 'published', slug } : l))
    setPublishing(false)
    toast(`Portfolio live at /portfolio/${slug}`, 'success')
  }

  async function addLearner(form) {
    const { data, error } = await supabase.from('learners').insert({ name: form.name, email: form.email, brand: form.brand, phone: form.phone }).select().single()
    if (error) { toast(error.message, 'error'); return }
    mutL(ls => [data, ...ls])
    setShowAdd(false)
    setSelLid(data.id); setSelGid(null); setGarments([]); setCollections([])
    toast(`${form.name} added!`, 'success')
  }

  const counts = { published: 0, 'in-progress': 0, new: 0 }
  learners.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++ })

  const filtered = learners
    .filter(l => {
      const q = search.toLowerCase()
      const matchSearch = !q || l.name.toLowerCase().includes(q) || (l.brand||'').toLowerCase().includes(q) || (l.location||'').toLowerCase().includes(q) || (l.email||'').toLowerCase().includes(q) || (l.phone||'').includes(q)
      const matchStatus = filterStatus === 'all' ? true
        : filterStatus === 'demo' ? l.is_demo
        : l.status === filterStatus
      return matchSearch && matchStatus
    })
    .sort((a, b) => {
      if (sortBy === 'name')   return a.name.localeCompare(b.name)
      if (sortBy === 'recent') return new Date(b.created_at||0) - new Date(a.created_at||0)
      if (sortBy === 'status') return a.status.localeCompare(b.status)
      return 0
    })

  const garmentsByCol = collections.reduce((acc, c) => {
    acc[c.id] = garments.filter(g => g.collection_id === c.id)
    return acc
  }, {})
  const ungrouped = garments.filter(g => !g.collection_id)
  const unreadEnq = enquiries.filter(e => !e.read).length

  return (
    <div style={{ display:'grid', gridTemplateRows:'56px 1fr', gridTemplateColumns:'256px 1fr', height:'100vh', overflow:'hidden', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Topbar */}
      <header style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:12, padding:'0 24px', background:'#0F0F0F', borderBottom:'1px solid #1E1E1E', zIndex:10 }}>
        <SIBLogo dark={true}/>
        <div style={{ width:1, height:24, background:'#2A2A2A', margin:'0 8px' }}/>
        <span style={{ fontSize:11, color:'#555', background:'#1A1A1A', padding:'2px 8px', borderRadius:99, border:'1px solid #2A2A2A' }}>Admin</span>
        <div style={{ display:'flex', gap:20, marginLeft:20 }}>
          {[['Published',counts.published,'#0D6B3A'],['In progress',counts['in-progress'],'#92400E'],['New',counts.new,'#555']].map(([l,v,c])=>(
            <div key={l} style={{ textAlign:'center' }}>
              <div style={{ fontSize:15, fontWeight:600, color:c }}>{v}</div>
              <div style={{ fontSize:10, color:'#444' }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          {learner?.slug && <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" style={{ ...btn('ghost'), color:'#888', textDecoration:'none', fontSize:12 }}>View site ↗</a>}
          <button style={{ ...btn(), fontSize:12 }} onClick={()=>setShowPlans(true)}>⚙ Plans & offers</button>
          <button style={btn('ghost')} onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{ background:'#131313', borderRight:'1px solid #1E1E1E', overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid #1E1E1E' }}>
          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, brand, city, email, phone…"
              style={{ flex:1, fontSize:12, padding:'7px 10px', border:'1px solid #2A2A2A', borderRadius:8, background:'#1A1A1A', color:'#fff', outline:'none', fontFamily:'inherit' }}/>
            <button style={{ ...btn('primary'), padding:'7px 12px', fontSize:12, flexShrink:0 }} onClick={()=>setShowAdd(true)}>+ Add</button>
          </div>
          <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:6 }}>
            {[['all','All',learners.length],['published','Live',counts.published],['in-progress','Active',counts['in-progress']],['new','New',counts.new],['demo','Demo',learners.filter(l=>l.is_demo).length]].map(([val,label,count])=>(
              <button key={val} onClick={()=>setFilterStatus(val)}
                style={{ fontSize:10, padding:'3px 8px', borderRadius:99, border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:filterStatus===val?600:400,
                  background: filterStatus===val ? '#F4622A' : '#2A2A2A',
                  color: filterStatus===val ? '#fff' : '#666' }}>
                {label} <span style={{ opacity:.7 }}>{count}</span>
              </button>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:11, color:'#444' }}>{filtered.length} learner{filtered.length!==1?'s':''}</div>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
              style={{ fontSize:10, padding:'2px 6px', border:'1px solid #2A2A2A', borderRadius:6, background:'#1A1A1A', color:'#666', outline:'none', fontFamily:'inherit', cursor:'pointer' }}>
              <option value="name">A → Z</option>
              <option value="recent">Newest first</option>
              <option value="status">By status</option>
            </select>
          </div>
        </div>

        {loadingL ? <div style={{ padding:32, textAlign:'center' }}><Spinner color="#F4622A"/></div>
          : filtered.length===0 ? (
            <div style={{ padding:'32px 16px', textAlign:'center' }}>
              <div style={{ fontSize:24, marginBottom:8, opacity:.3 }}>🔍</div>
              <div style={{ fontSize:12, color:'#555' }}>No learners match</div>
              {(search||filterStatus!=='all') && <button onClick={()=>{setSearch('');setFilterStatus('all')}} style={{ marginTop:8, fontSize:11, color:'#F4622A', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>Clear filters</button>}
            </div>
          ) : filtered.map(l=>(
            <div key={l.id} onClick={()=>{ setSelLid(l.id); setSelGid(null); setGarments([]); setCollections([]); setTab('garments') }}
              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #1A1A1A', borderLeft:`3px solid ${selLid===l.id?'#F4622A':'transparent'}`, background:selLid===l.id?'#1A1A1A':'transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                {l.photo_url
                  ? <img src={l.photo_url} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                  : <Avatar name={l.name} size={28}/>}
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ fontSize:13, fontWeight:500, color:'#ddd', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                    {l.is_demo && <span style={{ fontSize:9, background:'#4C1D95', color:'#C4B5FD', padding:'1px 5px', borderRadius:99, flexShrink:0 }}>DEMO</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#555', marginTop:1, display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:90 }}>{l.brand||'No brand'}</span>
                    <span>·</span>
                    <StatusBadge status={l.status}/>
                    {l.subscription_status==='active'&&<span style={{ fontSize:9, color:'#0D6B3A' }}>✓</span>}
                    {l.subscription_status==='trial'&&<span style={{ fontSize:9, color:'#92400E' }}>🎁</span>}
                    {l.subscription_status==='expired'&&<span style={{ fontSize:9, color:'#991B1B' }}>⚠</span>}
                  </div>
                  {l.location && <div style={{ fontSize:10, color:'#3A3A3A', marginTop:1 }}>📍 {l.location}</div>}
                </div>
              </div>
            </div>
          ))}
      </aside>

      {/* Main */}
      <main style={{ overflowY:'auto', padding:24, background:'#F7F6F4' }}>
        {!learner ? <Empty icon="←" title="Select a learner" message="Choose from the sidebar"/> : (
          <div style={{ maxWidth:900, display:'flex', flexDirection:'column', gap:16 }}>

            {/* Learner header card */}
            <div style={card}>
              <div style={{ padding:'14px 18px', display:'flex', alignItems:'center', gap:14 }}>
                {/* Photo */}
                <div style={{ position:'relative', flexShrink:0 }}>
                  {learner.photo_url
                    ? <img src={learner.photo_url} alt="" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', border:'2px solid #E8E6E2' }}/>
                    : <Avatar name={learner.name} size={48}/>}
                  <button onClick={()=>photoRef.current?.click()} title="Change photo"
                    style={{ position:'absolute', bottom:-2, right:-2, width:18, height:18, borderRadius:'50%', background:'#F4622A', border:'2px solid #fff', cursor:'pointer', fontSize:9, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
                  <input ref={photoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleProfileImg(e.target.files[0],'photo'); e.target.value='' }}/>
                </div>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:16, fontWeight:600 }}>{learner.name}</span>
                    <StatusBadge status={learner.status}/>
                  </div>
                  <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{learner.brand||'No brand'} · {learner.email}</div>
                </div>

                {/* Logo */}
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div onClick={()=>logoRef.current?.click()} title="Upload logo"
                    style={{ width:56, height:40, borderRadius:7, border:'1px dashed #D0CCC8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#FAFAFA' }}>
                    {learner.logo_url
                      ? <img src={learner.logo_url} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }}/>
                      : <span style={{ fontSize:9, color:'#ccc', textAlign:'center', lineHeight:1.4 }}>Upload<br/>logo</span>}
                  </div>
                  <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleProfileImg(e.target.files[0],'logo'); e.target.value='' }}/>
                  <button style={{ ...btn('primary'), fontSize:13, padding:'9px 20px' }} disabled={publishing||garments.length===0} onClick={()=>setShowPubConf(true)}>
                    {publishing ? <><Spinner size={13} color="#fff"/> Publishing…</> : learner.status==='published'?'↻ Republish':'↗ Publish'}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display:'flex', borderTop:'1px solid #F0EEE9', padding:'0 18px' }}>
                {[['garments',`Garments (${garments.length})`],['collections',`Collections (${collections.length})`],['enquiries',`Enquiries (${enquiries.length})`],['reviews','Reviews'],['subscription','Subscription'],['profile','Profile']].map(([t,l])=>(
                  <button key={t} onClick={()=>setTab(t)} style={{ padding:'10px 16px', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'#F4622A':'#888', background:'none', border:'none', borderBottom:tab===t?'2px solid #F4622A':'2px solid transparent', cursor:'pointer', marginBottom:-1, fontFamily:'inherit' }}>{l}</button>
                ))}
              </div>
            </div>

            {/* ── GARMENTS TAB ── */}
            {tab==='garments' && <>
              {learner?.is_demo && (
                <div style={{ margin:'0 0 12px', padding:'10px 14px', background:'#F0EFFE', borderRadius:8, border:'1px solid #DDD6FE', display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:16 }}>🎭</span>
                  <div>
                    <span style={{ fontSize:12, fontWeight:600, color:'#5B21B6' }}>Demo mode active</span>
                    <span style={{ fontSize:12, color:'#7C3AED', marginLeft:8 }}>AI tagging and poses use sample data — no API credits used</span>
                  </div>
                </div>
              )}
              <div style={card}>
                <div style={chead}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>Garment photos</div>
                    <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Upload → LIA tags & writes description automatically</div>
                  </div>
                  <button style={btn('primary')} onClick={()=>fileRef.current?.click()}>+ Upload garment</button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleUpload(e.target.files[0]); e.target.value='' }}/>
                </div>
                {loadingG ? <div style={{ padding:32, textAlign:'center' }}><Spinner/></div>
                  : garments.length===0 ? <Empty icon="📷" title="No garments yet" action={<button style={btn('primary')} onClick={()=>fileRef.current?.click()}>Upload first garment</button>}/>
                  : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10, padding:14 }}>
                      {garments.map((g,i)=><GarmentThumb key={g.id} garment={g} index={i} selected={selGid===g.id} onClick={()=>setSelGid(g.id)}/>)}
                    </div>}
              </div>

              {garment && ['uploading','tagging'].includes(garment.status) && (
                <div style={{ ...card, padding:'48px 20px', textAlign:'center' }}>
                  <div style={{ fontSize:28, color:'#F4622A', marginBottom:12, display:'inline-block', animation:'spin 2s linear infinite' }}>✦</div>
                  <div style={{ fontSize:14, fontWeight:500 }}>{garment.status==='uploading'?'Uploading…':'LIA is reading your garment…'}</div>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}

              {garment && !['uploading','tagging'].includes(garment.status) && (
                <div style={card}>
                  <div style={chead}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600 }}>{garment.name||'Garment details'}</div>
                      <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{garment.ai_tagged?'LIA auto-filled · all fields editable':'Fill in details'}</div>
                    </div>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <StatusBadge status={garment.status}/>
                      <button onClick={async()=>{
                        if(!confirm(`Delete "${garment.name}"? This cannot be undone.`)) return
                        await supabase.from('garments').delete().eq('id',garment.id)
                        mutG(gs=>gs.filter(g=>g.id!==garment.id))
                        setSelGid(null)
                        toast('Garment deleted','success')
                      }} style={{ fontSize:11, padding:'4px 10px', borderRadius:6, border:'1px solid #FCA5A5', background:'transparent', color:'#991B1B', cursor:'pointer', fontFamily:'inherit' }}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:garment.image_url?'160px 1fr':'1fr' }}>
                    {garment.image_url && (
                      <div style={{ padding:14, borderRight:'1px solid #F0EEE9' }}>
                        <img src={garment.image_url} alt="" style={{ width:'100%', borderRadius:8, objectFit:'cover', aspectRatio:'3/4' }}/>
                      </div>
                    )}
                    <div style={{ padding:'14px 16px' }}>
                      {/* Collection assignment */}
                      <div style={{ marginBottom:12 }}>
                        <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Collection</label>
                        <select value={garment.collection_id||''} onChange={e=>updateGarment('collection_id',e.target.value||null)}
                          style={{ width:'100%', fontSize:13, padding:'6px 10px', border:'1px solid #E2E0DC', borderRadius:8, background:'#fff', fontFamily:'inherit' }}>
                          <option value="">No collection</option>
                          {collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>

                      {/* Gender for LIA poses */}
                      <div style={{ marginBottom:14 }}>
                        <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:6 }}>Model gender for LIA poses</label>
                        <div style={{ display:'flex', gap:6 }}>
                          {[['female','👩 Female'],['male','👨 Male'],['unisex','✦ Unisex']].map(([g,label])=>(
                            <button key={g} onClick={()=>updateGarment('gender',g)}
                              style={{ flex:1, padding:'7px 6px', fontSize:12, fontWeight:500, borderRadius:8, border:`1px solid ${(garment.gender||'female')===g?'#F4622A':'#E2E0DC'}`, background:(garment.gender||'female')===g?'#FEF0EA':'#fff', color:(garment.gender||'female')===g?'#C94E1E':'#888', cursor:'pointer', fontFamily:'inherit' }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ fontSize:11, fontWeight:600, color:'#aaa', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>LIA-detected details</div>
                      {[['Garment name','name'],['Category','category'],['Fabric','fabric'],['Key features','features'],['Colour','colour'],['Occasion','occasion']].map(([l,f])=>(
                        <FieldRow key={f} label={l} value={garment[f]} onChange={v=>updateGarment(f,v)} ai={garment.ai_tagged}/>

                      ))}

                      <div style={{ fontSize:11, fontWeight:600, color:'#aaa', textTransform:'uppercase', letterSpacing:'.05em', margin:'14px 0 10px' }}>Pricing & availability</div>
                      {[['Price (₹)','price'],['Sizes','sizes'],['Availability','availability']].map(([l,f])=>(
                        <FieldRow key={f} label={l} value={garment[f]} onChange={v=>updateGarment(f,v)}/>
                      ))}

                      <div style={{ marginTop:12 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
                          <span style={{ fontSize:11, color:'#aaa' }}>Description</span>
                          <button style={{ ...btn(), fontSize:11, padding:'4px 10px' }} onClick={handleGenGarmentDesc} disabled={genningDesc}>
                            {genningDesc?<Spinner size={12} color="#F4622A"/>:'✦ LIA write'}
                          </button>
                        </div>
                        <textarea value={garment.description||''} onChange={e=>updateGarment('description',e.target.value)} rows={3}
                          placeholder="Click '✦ LIA write' to auto-generate"
                          style={{ width:'100%', fontSize:13, padding:'8px 10px', border:'1px solid #E2E0DC', borderRadius:8, resize:'vertical', outline:'none', fontFamily:'inherit', lineHeight:1.6 }}/>
                      </div>
                    </div>
                  </div>

                  {/* ── POSE GENERATION ── */}
                  <PoseSection garment={garment} onUpdate={updateGarment} toast={toast} demoMode={learner?.is_demo||false}/>
                </div>
              )}
            </>}

            {/* ── COLLECTIONS TAB ── */}
            {tab==='collections' && <>
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <button style={btn('primary')} onClick={()=>setShowAddCol(true)}>+ New collection</button>
              </div>
              {collections.length===0 ? (
                <div style={{ ...card, padding:'48px 24px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12, opacity:.3 }}>◈</div>
                  <div style={{ fontSize:15, fontWeight:500, color:'#555', marginBottom:8 }}>No collections yet</div>
                  <div style={{ fontSize:13, color:'#aaa', marginBottom:20 }}>Create collections to group and organise garments</div>
                  <button style={btn('primary')} onClick={()=>setShowAddCol(true)}>+ Create collection</button>
                </div>
              ) : collections.map(col=>(
                <div key={col.id} style={{ ...card, marginBottom:0 }}>
                  <div style={chead}>
                    <div style={{ flex:1 }}>
                      <input value={col.name} onChange={e=>updateCollection(col.id,{name:e.target.value})}
                        style={{ fontSize:15, fontWeight:600, color:'#111', border:'none', outline:'none', background:'transparent', fontFamily:'inherit', width:'100%' }}/>
                      <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>{col.season} {col.year} · {garmentsByCol[col.id]?.length||0} garment{garmentsByCol[col.id]?.length!==1?'s':''}</div>
                    </div>
                    <button style={btn()} onClick={()=>handleGenColDesc(col)}>✦ LIA description</button>
                  </div>
                  <div style={{ padding:'12px 16px 0' }}>
                    <textarea value={col.description} onChange={e=>updateCollection(col.id,{description:e.target.value})}
                      placeholder="Click '✦ LIA description' to auto-generate a collection description"
                      style={{ width:'100%', fontSize:13, color:'#555', border:'1px solid #F0EEE9', borderRadius:8, padding:'10px 12px', resize:'vertical', minHeight:72, outline:'none', fontFamily:'inherit', lineHeight:1.6 }}/>
                  </div>
                  <div style={{ padding:'12px 14px 14px' }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'#aaa', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>
                      Garments in collection ({garmentsByCol[col.id]?.length||0})
                    </div>
                    {(garmentsByCol[col.id]?.length||0)===0
                      ? <div style={{ fontSize:13, color:'#ccc', fontStyle:'italic' }}>No garments yet — assign garments from the Garments tab</div>
                      : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))', gap:8 }}>
                          {garmentsByCol[col.id].map((g,i)=><GarmentThumb key={g.id} garment={g} index={i} onClick={()=>{ setTab('garments'); setSelGid(g.id) }}/>)}
                        </div>}
                  </div>
                </div>
              ))}
            </>}

            {/* ── ENQUIRIES TAB ── */}
            {tab==='enquiries' && (
              <div style={card}>
                <div style={chead}><div style={{ fontSize:13, fontWeight:600 }}>Enquiries & orders</div><span style={{ fontSize:12, color:'#888' }}>{enquiries.length} total · {unreadEnq} unread</span></div>
                {enquiries.length===0 ? <Empty icon="✉" title="No enquiries yet" message="Enquiries from the portfolio website appear here."/> : (
                  <div style={{ display:'grid', gridTemplateColumns:selEnqId?'1fr 320px':'1fr' }}>
                    <div style={{ borderRight:selEnqId?'1px solid #F0EEE9':'none' }}>
                      {enquiries.map(e=>(
                        <div key={e.id} onClick={()=>setSelEnqId(selEnqId===e.id?null:e.id)}
                          style={{ padding:'13px 18px', borderBottom:'1px solid #F5F3F0', display:'flex', gap:12, cursor:'pointer', background:selEnqId===e.id?'#FEF8F6':e.read?'transparent':'#FFFAF8' }}>
                          <Avatar name={e.from_name} size={34}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                              <span style={{ fontSize:13, fontWeight:600 }}>{e.from_name}</span>
                              <StatusBadge status={e.type}/>
                              {!e.read&&<span style={{ width:7, height:7, borderRadius:'50%', background:'#F4622A', display:'inline-block' }}/>}
                              {e.measurements&&<span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:'#E6F4EC', color:'#0D6B3A', fontWeight:500 }}>📏 Measurements</span>}
                            </div>
                            {e.garment_name&&<div style={{ fontSize:12, color:'#aaa', marginBottom:3 }}>{e.garment_name}{e.size?` · Size ${e.size}`:''}</div>}
                            <div style={{ fontSize:13, color:'#666', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.message}</div>
                          </div>
                          <span style={{ fontSize:11, color:'#bbb', whiteSpace:'nowrap' }}>{new Date(e.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                        </div>
                      ))}
                    </div>
                    {selEnquiry&&(
                      <div style={{ padding:20, background:'#FDFCFC' }}>
                        <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>{selEnquiry.from_name}</div>
                        {selEnquiry.from_email&&<div style={{ fontSize:12, color:'#888', marginBottom:2 }}>{selEnquiry.from_email}</div>}
                        {selEnquiry.from_phone&&<div style={{ fontSize:12, color:'#888', marginBottom:12 }}>{selEnquiry.from_phone}</div>}
                        {selEnquiry.garment_name&&<div style={{ fontSize:12, color:'#F4622A', marginBottom:8, fontWeight:500 }}>{selEnquiry.garment_name}{selEnquiry.size?` · Size ${selEnquiry.size}`:''}</div>}
                        <div style={{ fontSize:13, color:'#555', lineHeight:1.65, marginBottom:16 }}>{selEnquiry.message}</div>
                        {selEnquiry.measurements&&(
                          <div style={{ background:'#F0EDEA', borderRadius:10, padding:14, marginBottom:16 }}>
                            <div style={{ fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>📏 Customer measurements</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                              {Object.entries(selEnquiry.measurements).filter(([,v])=>v).map(([k,v])=>(
                                <div key={k}>
                                  <div style={{ fontSize:10, color:'#aaa' }}>{k}</div>
                                  <div style={{ fontSize:13, fontWeight:500, color:'#333' }}>{v}"</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          {selEnquiry.from_phone&&<a href={`https://wa.me/${selEnquiry.from_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration:'none', background:'#E6F4EC', borderColor:'#52B27A', color:'#0D6B3A' }}>WhatsApp</a>}
                          {selEnquiry.from_email&&<a href={`mailto:${selEnquiry.from_email}`} style={{ ...btn(), textDecoration:'none', background:'#F0EFFE', borderColor:'#9B87F5', color:'#5B21B6' }}>Email</a>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── PROFILE TAB ── */}
            {tab==='profile' && (
              <div style={card}>
                <div style={chead}><div style={{ fontSize:13, fontWeight:600 }}>Learner profile</div></div>
                <div style={{ padding:18, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[['Full name','name'],['Brand name','brand'],['Email','email'],['Phone','phone'],
                    ['Tagline','tagline'],['Location','location'],['Speciality','speciality'],['Years experience','years_exp'],['Instagram','instagram']].map(([l,f])=>(
                    <div key={f}>
                      <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>{l}</label>
                      <input value={learner[f]||''} onChange={e=>updateLearner({[f]:e.target.value})}
                        style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', fontFamily:'inherit' }}/>
                    </div>
                  ))}
                  <div style={{ gridColumn:'1/-1' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <label style={{ fontSize:11, color:'#aaa' }}>Bio</label>
                      <button onClick={async()=>{
                        const name = learner.name, brand = learner.brand, speciality = learner.speciality
                        const res = await fetch('/api/tag-garment', { method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({ gen_bio: true, name, brand, speciality, skills: learner.skills, expertise: learner.expertise, demo_mode: learner.is_demo }) })
                        const d = await res.json()
                        if(d.description) updateLearner({ bio: d.description })
                        toast('Bio written ✓','success')
                      }} style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #E2E0DC', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>✦ LIA write</button>
                    </div>
                    <textarea value={learner.bio||''} onChange={e=>updateLearner({bio:e.target.value})} rows={3}
                      style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', resize:'vertical', fontFamily:'inherit' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Skills (comma separated)</label>
                    <input value={learner.skills||''} onChange={e=>updateLearner({skills:e.target.value})} placeholder="Embroidery, Pattern Making, Draping"
                      style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', fontFamily:'inherit' }}/>
                  </div>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <label style={{ fontSize:11, color:'#aaa' }}>Expertise (with descriptions)</label>
                      <button onClick={async()=>{
                        const res = await fetch('/api/tag-garment', { method:'POST', headers:{'Content-Type':'application/json'},
                          body: JSON.stringify({ gen_expertise: true, expertise: learner.expertise, speciality: learner.speciality, demo_mode: learner.is_demo }) })
                        const d = await res.json()
                        if(d.description) updateLearner({ expertise: d.description })
                        toast('Expertise expanded ✓','success')
                      }} style={{ fontSize:11, padding:'3px 10px', borderRadius:6, border:'1px solid #E2E0DC', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>✦ LIA expand</button>
                    </div>
                    <textarea value={learner.expertise||''} onChange={e=>updateLearner({expertise:e.target.value})} rows={2}
                      placeholder="e.g. Bridal Wear — specialising in heavy embroidery and traditional motifs&#10;Sustainable Fashion — eco-friendly fabrics and zero-waste patterns"
                      style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', resize:'vertical', fontFamily:'inherit' }}/>
                    <div style={{ fontSize:10, color:'#bbb', marginTop:3 }}>Click LIA expand to turn keywords into full descriptions · shown as expertise cards on portfolio</div>
                  </div>
                </div>
                <div style={{ padding:'0 18px 16px', fontSize:11, color:'#aaa' }}>
                  Learner sign-up link: <strong>{window.location.origin}/login</strong>
                </div>
                <CertificateManager learner={learner} toast={toast}/>
                <PasswordManager learner={learner} toast={toast}/>
                <DeleteLearner learner={learner} toast={toast} onDeleted={()=>{ setSelLid(null); loadLearners() }}/>
              </div>
            )}

            {/* ── SUBSCRIPTION TAB ── */}
            {tab==='reviews' && <AdminReviewsTab learner={learner} toast={toast} card={card} chead={chead} btn={btn}/>}
            {tab==='subscription' && <AdminSubscriptionTab learner={learner} toast={toast} btn={btn} card={card} chead={chead}/>}
          </div>
        )}
      </main>

      {showAdd&&<AddLearnerModal onAdd={addLearner} onClose={()=>setShowAdd(false)}/>}
      {showAddCol&&<AddCollectionModal onAdd={addCollection} onClose={()=>setShowAddCol(false)}/>}
      {showPlans&&<PlansModal onClose={()=>setShowPlans(false)} toast={toast}/>}
      {showPubConf&&(
        <Modal title="Publish portfolio" onClose={()=>setShowPubConf(false)} width={400}>
          <p style={{ fontSize:14, color:'#666', lineHeight:1.6, marginBottom:20 }}>Publish all tagged garments for <strong>{learner?.name}</strong>?</p>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button style={btn()} onClick={()=>setShowPubConf(false)}>Cancel</button>
            <button style={btn('primary')} onClick={handlePublish}>Publish ↗</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Admin Reviews Tab ─────────────────────────────────────────
function AdminReviewsTab({ learner, toast, card, chead, btn }) {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [learner.id])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('reviews').select('*').eq('learner_id', learner.id).order('created_at', { ascending: false })
    setReviews(data || [])
    setLoading(false)
  }

  async function approve(id) {
    await supabase.from('reviews').update({ approved: true }).eq('id', id)
    setReviews(r => r.map(x => x.id === id ? { ...x, approved: true } : x))
    toast('Review approved — visible on portfolio ✓', 'success')
  }

  async function remove(id) {
    await supabase.from('reviews').delete().eq('id', id)
    setReviews(r => r.filter(x => x.id !== id))
    toast('Review deleted', 'success')
  }

  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n)

  if (loading) return <div style={{ padding: 32, textAlign: 'center' }}><Spinner color="#F4622A" /></div>

  return (
    <div style={card}>
      <div style={chead}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Customer reviews</div>
        <span style={{ fontSize: 12, color: '#888' }}>{reviews.length} total · {reviews.filter(r => r.approved).length} approved</span>
      </div>
      {reviews.length === 0 ? (
        <div style={{ padding: '48px 24px', textAlign: 'center', color: '#aaa' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: .3 }}>★</div>
          <div style={{ fontSize: 14 }}>No reviews yet — they appear when customers submit them on the portfolio</div>
        </div>
      ) : reviews.map(r => (
        <div key={r.id} style={{ padding: '14px 18px', borderBottom: '1px solid #F5F3F0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{r.reviewer}</span>
              <span style={{ fontSize: 14, color: '#F4622A', letterSpacing: 1 }}>{stars(r.rating)}</span>
              {r.approved
                ? <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, background: '#E6F4EC', color: '#0D6B3A', fontWeight: 500 }}>✓ Live on portfolio</span>
                : <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, background: '#FEF3E2', color: '#92400E', fontWeight: 500 }}>Pending approval</span>}
            </div>
            <div style={{ fontSize: 13, color: '#555', lineHeight: 1.65 }}>"{r.text}"</div>
            <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {!r.approved && (
              <button onClick={() => approve(r.id)} style={{ ...btn(), fontSize: 11, background: '#E6F4EC', borderColor: '#52B27A', color: '#0D6B3A' }}>Approve</button>
            )}
            <button onClick={() => remove(r.id)} style={{ ...btn(), fontSize: 11, color: '#991B1B', borderColor: '#FCA5A5' }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Admin Subscription Tab ────────────────────────────────────
function AdminSubscriptionTab({ learner, toast, btn, card, chead }) {
  const [plans,    setPlans]    = useState([])
  const [activeSub,setActiveSub]= useState(null)
  const [usage,    setUsage]    = useState({ garments_used:0, poses_used:0 })
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [granting, setGranting] = useState(false)

  useEffect(() => { load() }, [learner.id])

  async function load() {
    setLoading(true)
    const [p, s, u, h] = await Promise.all([
      getPlans(),
      getActiveSubscription(learner.id),
      getUsage(learner.id),
      supabase.from('subscriptions').select('*, subscription_plans(name,slug)').eq('learner_id', learner.id).order('created_at', { ascending:false }).limit(10),
    ])
    setPlans(p)
    setActiveSub(s)
    setUsage(u)
    setHistory(h.data || [])
    setLoading(false)
  }

  async function handleGrantTrial() {
    const freePlan = plans.find(p => p.slug === 'free')
    if (!freePlan) { toast('Free plan not found in database', 'error'); return }
    if (learner.is_free_trial_used) {
      if (!confirm(`${learner.name} has already used their free trial. Grant another anyway?`)) return
    }
    setGranting(true)
    try {
      await grantFreeTrial(learner.id, freePlan.id)
      toast(`Free trial granted to ${learner.name} ✓`, 'success')
      await load()
    } catch(e) { toast(e.message, 'error') }
    setGranting(false)
  }

  async function handleExtend(months) {
    if (!activeSub) { toast('No active subscription to extend', 'error'); return }
    const newEnd = new Date(activeSub.end_date)
    newEnd.setMonth(newEnd.getMonth() + months)
    await supabase.from('subscriptions').update({ end_date: newEnd.toISOString() }).eq('id', activeSub.id)
    await supabase.from('learners').update({ subscription_end: newEnd.toISOString() }).eq('id', learner.id)
    toast(`Subscription extended by ${months} month${months>1?'s':''} ✓`, 'success')
    await load()
  }

  async function handleRevoke() {
    if (!confirm(`Revoke ${learner.name}'s subscription? Their portfolio will be unpublished.`)) return
    await supabase.from('subscriptions').update({ status:'expired' }).eq('learner_id', learner.id).in('status',['active','trial'])
    await supabase.from('learners').update({ subscription_status:'expired' }).eq('id', learner.id)
    toast('Subscription revoked', 'success')
    await load()
  }

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Spinner color="#F4622A"/></div>

  const isActive = activeSub && ['active','trial'].includes(activeSub.status) && new Date(activeSub.end_date) > new Date()
  const daysLeft = activeSub ? Math.max(0, Math.ceil((new Date(activeSub.end_date) - new Date()) / 86400000)) : 0
  const activePlan = activeSub?.subscription_plans

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

      {/* Current status */}
      <div style={card}>
        <div style={chead}>
          <div style={{ fontSize:13, fontWeight:600 }}>Subscription status</div>
          <div style={{ display:'flex', gap:8 }}>
            {!isActive && (
              <button style={btn('primary')} onClick={handleGrantTrial} disabled={granting}>
                {granting ? <><Spinner size={12} color="#fff"/> Granting…</> : '🎁 Grant free trial'}
              </button>
            )}
            {isActive && (
              <>
                <button style={btn()} onClick={()=>handleExtend(1)}>+ 1 month</button>
                <button style={btn()} onClick={()=>handleExtend(3)}>+ 3 months</button>
                <button style={{ ...btn(), color:'#991B1B', borderColor:'#FCA5A5' }} onClick={handleRevoke}>Revoke</button>
              </>
            )}
          </div>
        </div>
        <div style={{ padding:'14px 16px' }}>
          {isActive ? (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
              {[
                ['Plan', activePlan?.name || '—'],
                ['Status', activeSub.status==='trial'?'Free trial':'Active'],
                ['Days left', daysLeft],
                ['Expires', new Date(activeSub.end_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})],
                ['Amount paid', activeSub.amount_paid>0?`₹${Number(activeSub.amount_paid).toLocaleString('en-IN')}`:'Free'],
                ['Granted by', activeSub.granted_by_admin?'Admin':'Self-pay'],
              ].map(([l,v])=>(
                <div key={l}>
                  <div style={{ fontSize:11, color:'#aaa', marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:500, color:l==='Days left'&&daysLeft<=7?'#C94E1E':'#111' }}>{v}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:10, height:10, borderRadius:'50%', background: learner.subscription_status==='expired'?'#EF4444':'#D1D5DB', flexShrink:0 }}/>
              <div>
                <div style={{ fontSize:13, fontWeight:500 }}>
                  {learner.subscription_status==='expired' ? 'Subscription expired' : 'No subscription'}
                </div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
                  {learner.is_free_trial_used ? 'Free trial already used' : 'Free trial available'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Usage this month */}
      {isActive && activePlan && (
        <div style={card}>
          <div style={chead}><div style={{ fontSize:13, fontWeight:600 }}>Usage — {currentMonth()}</div></div>
          <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {[
              ['Garments uploaded', usage.garments_used, activePlan.garment_limit],
              ['LIA poses generated', usage.poses_used, activePlan.pose_limit],
            ].map(([label, used, limit])=>(
              <div key={label}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, color:'#555' }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:600 }}>{used} / {limit===-1?'∞':limit}</span>
                </div>
                <div style={{ height:6, background:'#F0EEE9', borderRadius:99, overflow:'hidden' }}>
                  {limit !== -1 && <div style={{ height:'100%', width:`${Math.min(100,(used/limit)*100)}%`, background:used/limit>=.8?'#C94E1E':'#F4622A', borderRadius:99 }}/>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      {history.length > 0 && (
        <div style={card}>
          <div style={chead}><div style={{ fontSize:13, fontWeight:600 }}>Subscription history</div></div>
          {history.map(h=>(
            <div key={h.id} style={{ padding:'10px 16px', borderBottom:'1px solid #F5F3F0', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:500 }}>{h.subscription_plans?.name}</div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>
                  {new Date(h.start_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} → {new Date(h.end_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                  {h.granted_by_admin && <span style={{ marginLeft:6, color:'#0D6B3A' }}>· Admin granted</span>}
                  {h.razorpay_payment_id && <span style={{ marginLeft:6, color:'#888', fontFamily:'monospace', fontSize:10 }}>{h.razorpay_payment_id.slice(0,16)}…</span>}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{h.amount_paid>0?`₹${Number(h.amount_paid).toLocaleString('en-IN')}`:'Free'}</div>
                <div style={{ fontSize:11, marginTop:2 }}>
                  <span style={{ padding:'1px 7px', borderRadius:99, fontSize:10, fontWeight:500, background:h.status==='active'||h.status==='trial'?'#E6F4EC':h.status==='expired'?'#FEE2E2':'#F3F4F6', color:h.status==='active'||h.status==='trial'?'#0D6B3A':h.status==='expired'?'#991B1B':'#666' }}>{h.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Field row ─────────────────────────────────────────────────
function FieldRow({ label, value, onChange, ai }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
      <span style={{ fontSize:11, color:'#aaa', width:82, flexShrink:0 }}>{label}</span>
      <input value={value||''} onChange={e=>onChange(e.target.value)}
        style={{ flex:1, fontSize:13, padding:'5px 9px', border:'1px solid #E2E0DC', borderRadius:7, outline:'none', fontFamily:'inherit' }}/>
      {ai&&<span style={{ fontSize:10, padding:'2px 6px', borderRadius:20, background:'#F0EFFE', color:'#5B21B6', flexShrink:0 }}>LIA</span>}
    </div>
  )
}

// ── Pose Generation Section ───────────────────────────────────
const POSE_LABELS = [
  { key:'front',   label:'Front',     icon:'👗' },
  { key:'back',    label:'Back',      icon:'🔄' },
  { key:'left',    label:'3/4 Left',  icon:'↖'  },
  { key:'right',   label:'3/4 Right', icon:'↗'  },
  { key:'walking', label:'Walking',   icon:'🚶' },
  { key:'sitting', label:'Sitting',   icon:'🪑' },
  { key:'closeup', label:'Close-up',  icon:'🔍' },
  { key:'outdoor', label:'Outdoor',   icon:'🌿' },
]

function PoseSection({ garment, onUpdate, toast, demoMode = false }) {
  const [submitting,   setSubmitting]  = useState(false)
  const [selPoses,     setSelPoses]    = useState(['front','back','walking','sitting'])
  const [poseTab,      setPoseTab]     = useState('generate')
  const [tryonImg,     setTryonImg]    = useState(null)
  const [tryonResult,  setTryonResult] = useState(null)
  const [tryonLoading, setTryonLoading]= useState(false)
  const tryonRef   = useRef()
  const pollRef    = useRef(null)
  const pollCount  = useRef(0)
  const MAX_POLLS  = 60 // 6s × 60 = 6 minutes max

  const poses        = garment.poses        || {}
  const pendingPoses = garment.pending_poses || {}
  const hasPending   = Object.keys(pendingPoses).length > 0
  const hasPoses     = Object.values(poses).some(Boolean)

  // Resume polling on mount only if there are pending poses
  useEffect(() => {
    if (Object.keys(pendingPoses).length > 0) {
      pollCount.current = 0
      startPolling()
    }
    return () => clearInterval(pollRef.current)
  }, [garment.id]) // only re-run if garment changes, not on every render

  function startPolling() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      pollCount.current++
      if (pollCount.current > MAX_POLLS) {
        clearInterval(pollRef.current)
        toast('Pose generation timed out — click Clear to reset', 'error')
        return
      }
      // Read latest pending_poses fresh from Supabase to avoid stale closure
      const { data: fresh } = await supabase.from('garments').select('poses,pending_poses').eq('id', garment.id).single()
      const pending = fresh?.pending_poses || {}
      if (Object.keys(pending).length === 0) { clearInterval(pollRef.current); return }

      try {
        const res = await fetch('/api/check-poses', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prediction_ids: pending }),
        })
        const data = await res.json()
        const completed = data.results || {}
        const stillPending = data.still_pending || {}

        if (Object.keys(completed).length > 0) {
          const merged = { ...(fresh?.poses||{}), ...completed }
          await onUpdate('poses', merged)
        }
        if (Object.keys(stillPending).length === 0) {
          clearInterval(pollRef.current)
          await onUpdate('pending_poses', {})
          if (Object.keys(completed).length > 0) toast('All poses ready ✓', 'success')
        } else {
          await onUpdate('pending_poses', stillPending)
        }
      } catch(e) { console.error('Poll error:', e) }
    }, 6000)
  }

  function togglePose(key) {
    setSelPoses(prev => prev.includes(key) ? prev.filter(k=>k!==key) : [...prev, key])
  }

  async function handleGenerate(poseKey) {
    if (!garment.image_url) { toast('Upload a garment image first', 'error'); return }
    const keys = poseKey ? [poseKey] : selPoses
    if (!keys.length) { toast('Select at least one pose', 'error'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/submit-poses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garment_image_url: garment.image_url, gender: garment.gender||'female', pose_keys: keys, demo_mode: demoMode }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      // Demo mode returns poses directly — no polling needed
      if (data.poses_direct) {
        await onUpdate('poses', { ...(garment.poses||{}), ...data.poses_direct })
        await onUpdate('pending_poses', {})
        toast(`${keys.length} demo pose${keys.length!==1?'s':''} ready ✓`, 'success')
      } else {
        const newPending = { ...pendingPoses, ...data.prediction_ids }
        await onUpdate('pending_poses', newPending)
        pollCount.current = 0
        startPolling()
        toast(`Generating ${keys.length} pose${keys.length!==1?'s':''} — safe to switch screens ✓`, 'default')
      }
    } catch(err) { toast(err.message||'Failed', 'error') }
    setSubmitting(false)
  }

  async function clearStuck() {
    clearInterval(pollRef.current)
    await onUpdate('pending_poses', {})
    toast('Cleared — you can now regenerate', 'success')
  }

  async function handleTryonUpload(file) {
    const reader = new FileReader()
    reader.onload = e => setTryonImg(e.target.result)
    reader.readAsDataURL(file)
  }

  async function handleTryon() {
    if (!tryonImg || !garment.image_url) { toast('Upload a photo first', 'error'); return }
    setTryonLoading(true)
    try {
      const base64 = tryonImg.split(',')[1]
      const res = await fetch('/api/try-on', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_image_base64: base64, garment_image_url: garment.image_url }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTryonResult(data.result_url)
      toast('Try-on complete ✓', 'success')
    } catch(err) { toast(err.message||'Try-on failed', 'error') }
    setTryonLoading(false)
  }

  if (!garment.image_url) return null

  return (
    <div style={{ borderTop:'1px solid #F0EEE9', padding:16 }}>
      {/* Tab switcher */}
      <div style={{ display:'flex', gap:0, marginBottom:14, background:'#F7F6F4', borderRadius:9, padding:3, width:'fit-content' }}>
        {[['generate','✦ LIA poses'],['tryon','👗 Try on me']].map(([t,l])=>(
          <button key={t} onClick={()=>setPoseTab(t)}
            style={{ padding:'6px 16px', fontSize:12, fontWeight:500, borderRadius:7, border:'none', cursor:'pointer', fontFamily:'inherit', background:poseTab===t?'#fff':'transparent', color:poseTab===t?'#111':'#888', boxShadow:poseTab===t?'0 1px 4px rgba(0,0,0,.08)':'none' }}>
            {l}
          </button>
        ))}
      </div>

      {poseTab==='generate' && <>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12, gap:10, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'#111' }}>LIA model poses</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{(garment.gender||'female')==='male'?'Male':'Female'} model · tap poses to select, then generate</div>
            {hasPending && (
              <div style={{ fontSize:11, color:'#F4622A', marginTop:4, display:'flex', alignItems:'center', gap:8 }}>
                <Spinner size={11} color="#F4622A"/> Generating — safe to switch screens
                <button onClick={clearStuck} style={{ fontSize:10, color:'#888', background:'none', border:'1px solid #E2E0DC', borderRadius:5, padding:'2px 8px', cursor:'pointer', fontFamily:'inherit' }}>Clear stuck</button>
              </div>
            )}
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={()=>setSelPoses(POSE_LABELS.map(p=>p.key))} style={{ fontSize:11, padding:'5px 10px', borderRadius:6, border:'1px solid #E2E0DC', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>All 8</button>
            <button onClick={()=>setSelPoses([])} style={{ fontSize:11, padding:'5px 10px', borderRadius:6, border:'1px solid #E2E0DC', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>None</button>
            <button onClick={()=>handleGenerate(null)} disabled={submitting||!selPoses.length}
              style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:600, borderRadius:8, border:'none', background: selPoses.length?'#F4622A':'#ccc', color:'#fff', cursor:selPoses.length?'pointer':'not-allowed', fontFamily:'inherit' }}>
              {submitting?<><Spinner size={12} color="#fff"/> Submitting…</>:`✦ Generate ${selPoses.length}`}
            </button>
          </div>
        </div>

        {/* 8-pose grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {POSE_LABELS.map(p => {
            const isPending = p.key in pendingPoses
            const isDone    = !!poses[p.key]
            const isSel     = selPoses.includes(p.key)
            return (
              <div key={p.key}
                style={{ borderRadius:10, overflow:'hidden', border:`2px solid ${isDone?'#E8E6E2':isSel?'#F4622A':'#F0EEE9'}`, background:isSel&&!isDone?'#FEF8F6':'#FAFAFA', position:'relative', cursor: isDone||isPending?'default':'pointer' }}
                onClick={()=>{ if(!isDone&&!isPending) togglePose(p.key) }}>
                {isDone ? (
                  <>
                    <img src={poses[p.key]} alt={p.label} style={{ width:'100%', aspectRatio:'3/4', objectFit:'cover', display:'block' }}/>
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'5px 7px', background:'linear-gradient(to top,rgba(0,0,0,.65),transparent)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <span style={{ fontSize:10, color:'#fff', fontWeight:500 }}>{p.label}</span>
                      <button onClick={e=>{e.stopPropagation();handleGenerate(p.key)}} disabled={submitting||isPending}
                        style={{ fontSize:9, padding:'2px 7px', background:'rgba(255,255,255,.25)', border:'none', borderRadius:4, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>
                        {isPending?'…':'Redo'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, padding:6 }}>
                    {isPending
                      ? <><Spinner size={18} color="#F4622A"/><div style={{ fontSize:9, color:'#aaa', textAlign:'center', lineHeight:1.4 }}>Generating…<br/>safe to switch</div></>
                      : <>
                          <div style={{ fontSize:20, opacity:.3 }}>{p.icon}</div>
                          <div style={{ fontSize:9, color:'#bbb', textAlign:'center', lineHeight:1.3 }}>{p.label}</div>
                          <div style={{ fontSize:9, fontWeight:600, color:isSel?'#F4622A':'#ccc' }}>{isSel?'✓ Selected':'tap to select'}</div>
                        </>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {hasPoses && !hasPending && (
          <div style={{ marginTop:10, fontSize:12, color:'#888', display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#0D6B3A', display:'inline-block' }}/>
            Poses visible on portfolio website
          </div>
        )}
      </>}

      {poseTab==='tryon' && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:'#111', marginBottom:4 }}>Virtual try-on</div>
          <div style={{ fontSize:12, color:'#888', lineHeight:1.6, marginBottom:12 }}>Upload a photo of the customer — LIA places this garment on them.</div>
          <div style={{ background:'#F7F6F4', borderRadius:10, padding:'12px 14px', marginBottom:14, fontSize:12, color:'#666', lineHeight:1.8 }}>
            <div style={{ fontWeight:600, marginBottom:6, color:'#111' }}>📸 Photo guidelines for best results</div>
            <div style={{ background:'#FEF0EA', border:'1px solid #F4622A44', borderRadius:7, padding:'7px 10px', marginBottom:6, fontSize:12, color:'#C94E1E', fontWeight:500 }}>
              ⚠ Must be a full body photo (head to toe) — portrait/bust shots only show the top half of the garment
            </div>
            <div>✓ Full body head-to-toe shot &nbsp; ✓ Plain background &nbsp; ✓ Facing forward</div>
            <div>✓ Good even lighting &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ✗ Avoid busy patterned clothing</div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div>
              <div style={{ fontSize:11, color:'#aaa', marginBottom:6 }}>Person photo</div>
              <div onClick={()=>tryonRef.current?.click()}
                style={{ border:`2px dashed ${tryonImg?'#F4622A':'#E2E0DC'}`, borderRadius:10, aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, cursor:'pointer', overflow:'hidden', background:'#FAFAFA' }}>
                {tryonImg
                  ? <img src={tryonImg} alt="person" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : <><div style={{ fontSize:24, opacity:.25 }}>👤</div><div style={{ fontSize:11, color:'#bbb' }}>Click to upload</div></>}
              </div>
              <input ref={tryonRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display:'none' }} onChange={e=>{if(e.target.files[0])handleTryonUpload(e.target.files[0]);e.target.value=''}}/>
              {tryonImg && <button onClick={()=>{setTryonImg(null);setTryonResult(null)}} style={{ marginTop:6, fontSize:11, color:'#aaa', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>Remove photo</button>}
            </div>
            <div>
              <div style={{ fontSize:11, color:'#aaa', marginBottom:6 }}>Try-on result</div>
              <div style={{ border:'1px solid #E2E0DC', borderRadius:10, aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, overflow:'hidden', background:'#FAFAFA' }}>
                {tryonResult
                  ? <img src={tryonResult} alt="try-on" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : tryonLoading
                    ? <><Spinner size={24} color="#F4622A"/><div style={{ fontSize:11, color:'#aaa', textAlign:'center', lineHeight:1.5 }}>Generating…<br/>30–120 seconds</div></>
                    : <><div style={{ fontSize:24, opacity:.15 }}>✦</div><div style={{ fontSize:11, color:'#ccc' }}>Result appears here</div></>}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleTryon} disabled={!tryonImg||tryonLoading}
              style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', fontSize:13, fontWeight:600, borderRadius:10, border:'none', background:tryonImg&&!tryonLoading?'#F4622A':'#ccc', color:'#fff', cursor:tryonImg&&!tryonLoading?'pointer':'not-allowed', fontFamily:'inherit' }}>
              {tryonLoading?<><Spinner size={14} color="#fff"/> Generating try-on…</>:'✦ Generate try-on'}
            </button>
            {tryonResult && (
              <a href={tryonResult} download="tryon.png" style={{ padding:'10px 16px', fontSize:12, fontWeight:500, borderRadius:10, border:'1px solid #E2E0DC', background:'#fff', color:'#333', textDecoration:'none', display:'inline-flex', alignItems:'center' }}>↓ Save</a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Password Manager ──────────────────────────────────────────
// ── Certificate Manager ───────────────────────────────────────
function CertificateManager({ learner, toast }) {
  const [certs,    setCerts]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [adding,   setAdding]   = useState(false)
  const [form,     setForm]     = useState({ name:'', issuer:'Skillinabox', issued_on:'' })
  const [uploading,setUploading]= useState(false)
  const fileRef = useRef()

  useEffect(() => { loadCerts() }, [learner.id])

  async function loadCerts() {
    setLoading(true)
    const { data } = await supabase.from('certificates').select('*').eq('learner_id', learner.id).order('display_order')
    setCerts(data || [])
    setLoading(false)
  }

  async function handleAdd() {
    if (!form.name) { toast('Enter a certificate name', 'error'); return }
    const { data, error } = await supabase.from('certificates').insert({
      learner_id: learner.id,
      name: form.name,
      issuer: form.issuer,
      issued_on: form.issued_on,
      display_order: certs.length,
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    setCerts(c => [...c, data])
    setForm({ name:'', issuer:'Skillinabox', issued_on:'' })
    setAdding(false)
    toast('Certificate added ✓', 'success')
  }

  async function handleUploadImage(certId, file) {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${learner.id}/cert-${certId}.${ext}`
      const { error } = await supabase.storage.from('garments').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('garments').getPublicUrl(path)
      await supabase.from('certificates').update({ image_url: publicUrl }).eq('id', certId)
      setCerts(c => c.map(x => x.id === certId ? { ...x, image_url: publicUrl } : x))
      toast('Certificate image uploaded ✓', 'success')
    } catch(e) { toast(e.message, 'error') }
    setUploading(false)
  }

  async function deleteCert(id) {
    await supabase.from('certificates').delete().eq('id', id)
    setCerts(c => c.filter(x => x.id !== id))
    toast('Deleted', 'success')
  }

  const s = { display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px', fontSize:11, fontWeight:500, borderRadius:7, border:'1px solid', cursor:'pointer', fontFamily:'inherit' }

  return (
    <div style={{ margin:'0 18px 16px', padding:'14px 16px', background:'#F7F6F4', borderRadius:10 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#111' }}>Certificates & credentials</div>
        <button onClick={()=>setAdding(a=>!a)} style={{ ...s, background:'#F4622A', borderColor:'#F4622A', color:'#fff' }}>
          {adding ? '✕ Cancel' : '+ Add certificate'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div style={{ background:'#fff', borderRadius:8, padding:12, marginBottom:12, display:'flex', flexDirection:'column', gap:8 }}>
          {[['Certificate name *','name','e.g. Fashion Design Diploma'],['Issuing body','issuer','e.g. Skillinabox'],['Date issued','issued_on','e.g. March 2025']].map(([l,k,ph])=>(
            <div key={k}>
              <label style={{ fontSize:10, color:'#aaa', display:'block', marginBottom:3 }}>{l}</label>
              <input value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} placeholder={ph}
                style={{ width:'100%', fontSize:12, padding:'6px 10px', border:'1px solid #E2E0DC', borderRadius:6, outline:'none', fontFamily:'inherit' }}/>
            </div>
          ))}
          <button onClick={handleAdd} style={{ ...s, background:'#F4622A', borderColor:'#F4622A', color:'#fff', justifyContent:'center', padding:'8px' }}>Add certificate</button>
        </div>
      )}

      {/* Certificate list */}
      {loading ? <div style={{ textAlign:'center', padding:16 }}><Spinner size={16} color="#F4622A"/></div>
        : certs.length === 0 ? <div style={{ fontSize:12, color:'#bbb', fontStyle:'italic' }}>No certificates yet — click "Add certificate" to get started</div>
        : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {certs.map(cert => {
              const certFileRef = { current: null }
              return (
                <div key={cert.id} style={{ background:'#fff', borderRadius:8, padding:'10px 12px', display:'flex', gap:12, alignItems:'center' }}>
                  {/* Certificate thumbnail */}
                  <div onClick={()=>{
                    const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
                    inp.onchange=e=>{ if(e.target.files[0]) handleUploadImage(cert.id, e.target.files[0]) }
                    inp.click()
                  }} style={{ width:48, height:48, borderRadius:6, border:'1px dashed #D0CCC8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0, background:'#F7F6F4' }} title="Upload certificate image">
                    {cert.image_url
                      ? <img src={cert.image_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                      : <span style={{ fontSize:18, opacity:.4 }}>📜</span>}
                  </div>
                  {/* Details */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'#111', marginBottom:2 }}>{cert.name}</div>
                    <div style={{ fontSize:11, color:'#888' }}>{cert.issuer}{cert.issued_on ? ` · ${cert.issued_on}` : ''}</div>
                    {!cert.image_url && <div style={{ fontSize:10, color:'#bbb', marginTop:2 }}>Click the icon to upload the certificate image</div>}
                  </div>
                  <button onClick={()=>deleteCert(cert.id)} style={{ ...s, background:'transparent', borderColor:'#FCA5A5', color:'#991B1B', padding:'4px 8px' }}>✕</button>
                </div>
              )
            })}
          </div>
        )}
      {uploading && <div style={{ fontSize:11, color:'#F4622A', marginTop:8, display:'flex', alignItems:'center', gap:5 }}><Spinner size={11} color="#F4622A"/> Uploading image…</div>}
    </div>
  )
}

function PasswordManager({ learner, toast }) {
  const [tempPass,   setTempPass]   = useState(null)
  const [sending,    setSending]    = useState(false)
  const [generating, setGenerating] = useState(false)
  const [copied,     setCopied]     = useState(false)

  function makeTempPassword() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const special = '@#!'
    let pass = ''
    for (let i = 0; i < 6; i++) pass += chars[Math.floor(Math.random() * chars.length)]
    pass += special[Math.floor(Math.random() * special.length)]
    pass += Math.floor(Math.random() * 90 + 10)
    return pass.split('').sort(() => Math.random() - .5).join('')
  }

  async function handleSendReset() {
    setSending(true)
    const { error } = await supabase.auth.resetPasswordForEmail(learner.email, {
      redirectTo: `${window.location.origin}/login`
    })
    setSending(false)
    if (error) toast(error.message, 'error')
    else toast(`Password reset email sent to ${learner.email} ✓`, 'success')
  }

  async function handleGenTemp() {
    setGenerating(true)
    const pass = makeTempPassword()
    // Update password via Supabase admin (uses service role via our API)
    const res = await fetch('/api/set-temp-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: learner.email, password: pass }),
    })
    const data = await res.json()
    setGenerating(false)
    if (data.error) { toast(data.error, 'error'); return }
    setTempPass(pass)
    toast('Temporary password set ✓', 'success')
  }

  async function copyPass() {
    await navigator.clipboard.writeText(tempPass)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const s = { display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:500, borderRadius:8, border:'1px solid', cursor:'pointer', fontFamily:'inherit' }

  return (
    <div style={{ margin:'0 18px 16px', padding:'14px', background:'#F7F6F4', borderRadius:10 }}>
      <div style={{ fontSize:12, fontWeight:600, color:'#111', marginBottom:10 }}>Password management</div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom: tempPass ? 12 : 0 }}>
        <button onClick={handleSendReset} disabled={sending}
          style={{ ...s, background:'#fff', borderColor:'#E2E0DC', color:'#333' }}>
          {sending ? <><Spinner size={12} color="#555"/> Sending…</> : '✉ Send reset email'}
        </button>
        <button onClick={handleGenTemp} disabled={generating}
          style={{ ...s, background:'#F4622A', borderColor:'#F4622A', color:'#fff' }}>
          {generating ? <><Spinner size={12} color="#fff"/> Generating…</> : '⚡ Generate temp password'}
        </button>
      </div>

      {tempPass && (
        <div style={{ marginTop:10, padding:'10px 14px', background:'#fff', border:'1px solid #E2E0DC', borderRadius:8 }}>
          <div style={{ fontSize:11, color:'#888', marginBottom:6 }}>
            Temp password for <strong>{learner.name}</strong> — share via WhatsApp or call. Ask them to change it after login.
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <code style={{ fontSize:18, fontWeight:700, color:'#111', letterSpacing:'.1em', fontFamily:'monospace', flex:1 }}>{tempPass}</code>
            <button onClick={copyPass} style={{ ...s, background: copied?'#E6F4EC':'#fff', borderColor: copied?'#52B27A':'#E2E0DC', color: copied?'#0D6B3A':'#555', padding:'5px 12px' }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <a href={`https://wa.me/${learner.phone?.replace(/\D/g,'')}?text=${encodeURIComponent(`Hi ${learner.name.split(' ')[0]}, your Skillinabox portfolio login:\nEmail: ${learner.email}\nTemp password: ${tempPass}\n\nPlease change your password after logging in at ${window.location.origin}/login`)}`}
              target="_blank" rel="noreferrer"
              style={{ ...s, textDecoration:'none', background:'#E6F4EC', borderColor:'#52B27A', color:'#0D6B3A' }}>
              WhatsApp
            </a>
          </div>
          <div style={{ marginTop:8, fontSize:11, color:'#F4622A' }}>⚠ This password is shown once — save it now</div>
        </div>
      )}
    </div>
  )
}

// ── Delete Learner ────────────────────────────────────────────
function DeleteLearner({ learner, toast, onDeleted }) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [typed, setTyped] = useState('')

  async function handleDelete() {
    if (typed !== learner.name) { toast('Name does not match', 'error'); return }
    setDeleting(true)
    try {
      const res = await fetch('/api/delete-learner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learner_id: learner.id, learner_email: learner.email }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      toast(`${learner.name} and all their data deleted`, 'success')
      onDeleted()
    } catch(err) {
      toast(err.message || 'Delete failed', 'error')
      setDeleting(false)
    }
  }

  const s = { display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:500, borderRadius:8, border:'1px solid', cursor:'pointer', fontFamily:'inherit' }

  if (!confirm) return (
    <div style={{ margin:'0 18px 18px', borderTop:'1px solid #FEE2E2', paddingTop:14 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', background:'#F0EFFE', borderRadius:8, marginBottom:12 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:'#5B21B6' }}>🎭 Demo mode {learner.is_demo ? 'ON' : 'OFF'}</div>
          <div style={{ fontSize:11, color:'#7C3AED', marginTop:2 }}>When ON — AI tagging and poses use sample data instantly, no API costs</div>
        </div>
        <button onClick={async(e)=>{
          e.stopPropagation()
          const val = !learner.is_demo
          updateLearner({ is_demo: val })
          toast(val ? '🎭 Demo mode ON — no API costs' : 'Demo mode OFF — live API enabled', 'success')
        }} style={{ padding:'7px 16px', fontSize:12, fontWeight:600, borderRadius:8, border:'none', background: learner.is_demo ? '#5B21B6' : '#E9D5FF', color: learner.is_demo ? '#fff' : '#5B21B6', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
          {learner.is_demo ? 'Turn OFF' : 'Turn ON'}
        </button>
      </div>
      <button onClick={()=>setConfirm(true)}
        style={{ ...s, background:'transparent', borderColor:'#FCA5A5', color:'#991B1B', fontSize:12 }}>
        ✕ Delete learner & all data
      </button>
    </div>
  )

  return (
    <div style={{ margin:'0 18px 18px', background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:10, padding:'14px 16px' }}>
      <div style={{ fontSize:13, fontWeight:600, color:'#991B1B', marginBottom:6 }}>Delete {learner.name}?</div>
      <div style={{ fontSize:12, color:'#B91C1C', lineHeight:1.6, marginBottom:12 }}>
        This permanently deletes all garments, photos, collections, enquiries, subscriptions and their login account. <strong>This cannot be undone.</strong>
      </div>
      <div style={{ marginBottom:10 }}>
        <label style={{ fontSize:11, color:'#991B1B', display:'block', marginBottom:5 }}>
          Type <strong>{learner.name}</strong> to confirm
        </label>
        <input value={typed} onChange={e=>setTyped(e.target.value)} placeholder={learner.name}
          style={{ width:'100%', fontSize:13, padding:'8px 10px', border:'1px solid #FCA5A5', borderRadius:8, outline:'none', fontFamily:'inherit', background:'#fff' }}/>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={()=>{ setConfirm(false); setTyped('') }} style={{ ...s, background:'#fff', borderColor:'#E2E0DC', color:'#555' }}>Cancel</button>
        <button onClick={handleDelete} disabled={deleting || typed !== learner.name}
          style={{ ...s, background: typed===learner.name?'#DC2626':'#FCA5A5', borderColor:'transparent', color:'#fff', opacity: typed!==learner.name?.6:1 }}>
          {deleting ? <><Spinner size={12} color="#fff"/> Deleting…</> : 'Yes, delete everything'}
        </button>
      </div>
    </div>
  )
}

// ── Plans & Offers Management Modal ──────────────────────────
function PlansModal({ onClose, toast }) {
  const [plans,   setPlans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('subscription_plans').select('*').order('display_order')
    setPlans(data || [])
    setLoading(false)
  }

  async function savePlan(id, patch) {
    setSaving(id)
    await supabase.from('subscription_plans').update(patch).eq('id', id)
    setPlans(ps => ps.map(p => p.id === id ? { ...p, ...patch } : p))
    setSaving(null)
    toast('Saved ✓', 'success')
  }

  const inp = { fontSize:13, padding:'6px 10px', border:'1px solid #E2E0DC', borderRadius:7, outline:'none', fontFamily:'inherit', width:'100%' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:720, maxHeight:'85vh', overflow:'auto', boxShadow:'0 24px 80px rgba(0,0,0,.25)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:'1px solid #F0EEE9', position:'sticky', top:0, background:'#fff', zIndex:1 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:600 }}>Plans & offers</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Edit pricing, limits and descriptions — changes apply immediately</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#aaa', lineHeight:1 }}>×</button>
        </div>

        {loading ? <div style={{ padding:40, textAlign:'center' }}><Spinner color="#F4622A"/></div> : (
          <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
            {plans.map(plan => (
              <div key={plan.id} style={{ border:'1px solid #E8E6E2', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'10px 14px', background:plan.is_active?'#F7F6F4':'#FEE2E2', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ fontSize:14, fontWeight:600, flex:1 }}>{plan.name}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:12, color:'#888' }}>Active</span>
                    <div onClick={()=>savePlan(plan.id,{is_active:!plan.is_active})}
                      style={{ width:36, height:20, borderRadius:99, background:plan.is_active?'#F4622A':'#D1D5DB', cursor:'pointer', position:'relative', transition:'background .2s' }}>
                      <div style={{ position:'absolute', top:2, left:plan.is_active?18:2, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s' }}/>
                    </div>
                  </div>
                </div>
                <div style={{ padding:'14px', display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10 }}>
                  {[
                    ['Price (₹)', 'price_inr', 'number'],
                    ['Duration (months)', 'duration_months', 'number'],
                    ['Free bonus months', 'free_months', 'number'],
                    ['Garment limit/month (-1=∞)', 'garment_limit', 'number'],
                    ['LIA pose limit/month (-1=∞)', 'pose_limit', 'number'],
                  ].map(([label, field, type]) => (
                    <div key={field}>
                      <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>{label}</label>
                      <input type={type} style={inp} value={plan[field]}
                        onChange={e=>setPlans(ps=>ps.map(p=>p.id===plan.id?{...p,[field]:type==='number'?Number(e.target.value):e.target.value}:p))}
                        onBlur={()=>savePlan(plan.id,{[field]:plan[field]})}/>
                    </div>
                  ))}
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Description (shown to learners)</label>
                    <input style={inp} value={plan.description}
                      onChange={e=>setPlans(ps=>ps.map(p=>p.id===plan.id?{...p,description:e.target.value}:p))}
                      onBlur={()=>savePlan(plan.id,{description:plan.description})}/>
                  </div>
                </div>
                {saving===plan.id && <div style={{ padding:'6px 14px', fontSize:11, color:'#F4622A', background:'#FEF8F6', borderTop:'1px solid #F0EEE9' }}>Saving…</div>}
              </div>
            ))}
            <div style={{ fontSize:12, color:'#aaa', padding:'10px 14px', background:'#F7F6F4', borderRadius:9 }}>
              Changes are saved automatically when you click away from each field. Pricing changes apply to new subscriptions only — existing subscribers keep their current terms.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AddLearnerModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:'', email:'', brand:'', phone:'' })
  const [loading, setLoading] = useState(false)
  async function submit(e) { e.preventDefault(); setLoading(true); await onAdd(form); setLoading(false) }
  return (
    <Modal title="Add new learner" onClose={onClose} width={420}>
      <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {[['Full name *','name','text'],['Email *','email','email'],['Brand name','brand','text'],['Phone','phone','tel']].map(([l,k,t])=>(
          <div key={k}>
            <label style={{ fontSize:12, color:'#888', display:'block', marginBottom:4 }}>{l}</label>
            <input type={t} value={form[k]} onChange={e=>setForm(p=>({...p,[k]:e.target.value}))} required={l.includes('*')}
              style={{ width:'100%', fontSize:13, padding:'8px 12px', border:'1px solid #E2E0DC', borderRadius:9, outline:'none', fontFamily:'inherit' }}/>
          </div>
        ))}
        <div style={{ padding:'10px 12px', background:'#FEF0EA', borderRadius:9, fontSize:12, color:'#C94E1E' }}>
          Share <strong>{window.location.origin}/login</strong> — learner signs up with this exact email.
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" style={btn()} onClick={onClose}>Cancel</button>
          <button type="submit" style={btn('primary')} disabled={loading}>{loading?<Spinner size={13} color="#fff"/>:'Add learner'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AddCollectionModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:'', season:'', year:new Date().getFullYear().toString() })
  const [loading, setLoading] = useState(false)
  async function submit(e) { e.preventDefault(); setLoading(true); await onAdd(form); setLoading(false) }
  return (
    <Modal title="New collection" onClose={onClose} width={400}>
      <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div>
          <label style={{ fontSize:12, color:'#888', display:'block', marginBottom:4 }}>Collection name *</label>
          <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Bridal 2025, Summer Festive" required
            style={{ width:'100%', fontSize:13, padding:'8px 12px', border:'1px solid #E2E0DC', borderRadius:9, outline:'none', fontFamily:'inherit' }}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ fontSize:12, color:'#888', display:'block', marginBottom:4 }}>Season</label>
            <select value={form.season} onChange={e=>setForm(p=>({...p,season:e.target.value}))}
              style={{ width:'100%', fontSize:13, padding:'8px 12px', border:'1px solid #E2E0DC', borderRadius:9, fontFamily:'inherit' }}>
              {['Any','Spring','Summer','Monsoon','Festive','Winter','Bridal'].map(s=><option key={s} value={s==='Any'?'':s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:12, color:'#888', display:'block', marginBottom:4 }}>Year</label>
            <input type="number" value={form.year} onChange={e=>setForm(p=>({...p,year:e.target.value}))}
              style={{ width:'100%', fontSize:13, padding:'8px 12px', border:'1px solid #E2E0DC', borderRadius:9, outline:'none', fontFamily:'inherit' }}/>
          </div>
        </div>
        <div style={{ fontSize:12, color:'#aaa', padding:'8px 12px', background:'#F7F6F4', borderRadius:9 }}>
          ✦ LIA will auto-generate a description for this collection
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" style={btn()} onClick={onClose}>Cancel</button>
          <button type="submit" style={btn('primary')} disabled={loading}>{loading?<Spinner size={13} color="#fff"/>:'Create collection'}</button>
        </div>
      </form>
    </Modal>
  )
}
