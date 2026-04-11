import { useState, useEffect, useRef } from 'react'
import { supabase, uploadGarmentImage, uploadProfileImage, tagGarment, generateCollectionDesc, generateGarmentDesc, makeSlug, fileToBase64 } from '../lib/supabase'
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
  const [selLid,       setSelLid]       = useState(null)
  const [collections,  setCollections]  = useState([])
  const [garments,     setGarments]     = useState([])
  const [enquiries,    setEnquiries]    = useState([])
  const [selGid,       setSelGid]       = useState(null)
  const [selEnqId,     setSelEnqId]     = useState(null)
  const [loadingL,     setLoadingL]     = useState(true)
  const [loadingG,     setLoadingG]     = useState(false)
  const [search,       setSearch]       = useState('')
  const [tab,          setTab]          = useState('garments')
  const [publishing,   setPublishing]   = useState(false)
  const [showAdd,      setShowAdd]      = useState(false)
  const [showAddCol,   setShowAddCol]   = useState(false)
  const [showPubConf,  setShowPubConf]  = useState(false)
  const [genningDesc,  setGenningDesc]  = useState(false)

  const fileRef  = useRef()
  const photoRef = useRef()
  const logoRef  = useRef()

  const learner  = learners.find(l => l.id === selLid)
  const garment  = garments.find(g => g.id === selGid)
  const selEnquiry = enquiries.find(e => e.id === selEnqId)

  useEffect(() => { loadLearners() }, [])
  useEffect(() => { if (selLid) { loadAll(selLid) } }, [selLid])

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
      const tags = await tagGarment(base64, file.type)
      const updates = { ...tags, name: tags.name || file.name.replace(/\.[^.]+$/, ''), status: 'tagged', ai_tagged: true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, ...updates } : x))
      toast('AI tagging done ✓', 'success')
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
      const desc = await generateGarmentDesc(garment.name, garment.category, garment.fabric, garment.features)
      await updateGarment('description', desc)
      toast('Description generated ✓', 'success')
    } catch { toast('Failed', 'error') }
    setGenningDesc(false)
  }

  async function handleGenColDesc(col) {
    const gNames = garments.filter(g => g.collection_id === col.id).map(g => g.name)
    try {
      const desc = await generateCollectionDesc(col.name, gNames)
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
    const desc = await generateCollectionDesc(form.name, []).catch(() => '')
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
  const filtered = learners.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) || (l.brand||'').toLowerCase().includes(search.toLowerCase()))

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
          <button style={btn('ghost')} onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{ background:'#131313', borderRight:'1px solid #1E1E1E', overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid #1E1E1E' }}>
          <div style={{ display:'flex', gap:8, marginBottom:6 }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search learners…"
              style={{ flex:1, fontSize:13, padding:'7px 10px', border:'1px solid #2A2A2A', borderRadius:8, background:'#1A1A1A', color:'#fff', outline:'none', fontFamily:'inherit' }}/>
            <button style={{ ...btn('primary'), padding:'7px 12px' }} onClick={()=>setShowAdd(true)}>+ Add</button>
          </div>
          <div style={{ fontSize:11, color:'#444' }}>{filtered.length} learner{filtered.length!==1?'s':''}</div>
        </div>

        {loadingL ? <div style={{ padding:32, textAlign:'center' }}><Spinner color="#F4622A"/></div>
          : filtered.length===0 ? <Empty icon="👩" title="No learners yet" action={<button style={btn('primary')} onClick={()=>setShowAdd(true)}>+ Add</button>}/>
          : filtered.map(l=>(
            <div key={l.id} onClick={()=>{ setSelLid(l.id); setSelGid(null); setGarments([]); setCollections([]); setTab('garments') }}
              style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #1A1A1A', borderLeft:`3px solid ${selLid===l.id?'#F4622A':'transparent'}`, background:selLid===l.id?'#1A1A1A':'transparent' }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                {l.photo_url
                  ? <img src={l.photo_url} alt="" style={{ width:28, height:28, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                  : <Avatar name={l.name} size={28}/>}
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:500, color:'#ddd', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.name}</div>
                  <div style={{ fontSize:11, color:'#555', marginTop:1 }}>{l.brand||'No brand'} · <StatusBadge status={l.status}/></div>
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
                {[['garments',`Garments (${garments.length})`],['collections',`Collections (${collections.length})`],['enquiries',`Enquiries (${enquiries.length})`],['profile','Profile']].map(([t,l])=>(
                  <button key={t} onClick={()=>setTab(t)} style={{ padding:'10px 16px', fontSize:13, fontWeight:tab===t?600:400, color:tab===t?'#F4622A':'#888', background:'none', border:'none', borderBottom:tab===t?'2px solid #F4622A':'2px solid transparent', cursor:'pointer', marginBottom:-1, fontFamily:'inherit' }}>{l}</button>
                ))}
              </div>
            </div>

            {/* ── GARMENTS TAB ── */}
            {tab==='garments' && <>
              <div style={card}>
                <div style={chead}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>Garment photos</div>
                    <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Upload → AI auto-tags + writes description</div>
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
                  <div style={{ fontSize:14, fontWeight:500 }}>{garment.status==='uploading'?'Uploading…':'Claude AI is analysing the garment…'}</div>
                  <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                </div>
              )}

              {garment && !['uploading','tagging'].includes(garment.status) && (
                <div style={card}>
                  <div style={chead}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:600 }}>{garment.name||'Garment details'}</div>
                      <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{garment.ai_tagged?'AI auto-filled · all fields editable':'Fill in details'}</div>
                    </div>
                    <StatusBadge status={garment.status}/>
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

                      <div style={{ fontSize:11, fontWeight:600, color:'#aaa', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>AI-detected details</div>
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
                            {genningDesc?<Spinner size={12} color="#F4622A"/>:'✦ AI write'}
                          </button>
                        </div>
                        <textarea value={garment.description||''} onChange={e=>updateGarment('description',e.target.value)} rows={3}
                          placeholder="Click '✦ AI write' to auto-generate"
                          style={{ width:'100%', fontSize:13, padding:'8px 10px', border:'1px solid #E2E0DC', borderRadius:8, resize:'vertical', outline:'none', fontFamily:'inherit', lineHeight:1.6 }}/>
                      </div>
                    </div>
                  </div>
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
                    <button style={btn()} onClick={()=>handleGenColDesc(col)}>✦ AI description</button>
                  </div>
                  <div style={{ padding:'12px 16px 0' }}>
                    <textarea value={col.description} onChange={e=>updateCollection(col.id,{description:e.target.value})}
                      placeholder="Click '✦ AI description' to auto-generate a collection description"
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
                    <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Bio</label>
                    <textarea value={learner.bio||''} onChange={e=>updateLearner({bio:e.target.value})} rows={3}
                      style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', resize:'vertical', fontFamily:'inherit' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Skills (comma separated)</label>
                    <input value={learner.skills||''} onChange={e=>updateLearner({skills:e.target.value})} placeholder="Embroidery, Pattern Making, Draping"
                      style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', fontFamily:'inherit' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Expertise (comma separated)</label>
                    <input value={learner.expertise||''} onChange={e=>updateLearner({expertise:e.target.value})} placeholder="Bridal Wear, Sustainable Fashion"
                      style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', fontFamily:'inherit' }}/>
                  </div>
                </div>
                <div style={{ padding:'0 18px 16px', fontSize:11, color:'#aaa' }}>
                  Learner sign-up link: <strong>{window.location.origin}/login</strong>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showAdd&&<AddLearnerModal onAdd={addLearner} onClose={()=>setShowAdd(false)}/>}
      {showAddCol&&<AddCollectionModal onAdd={addCollection} onClose={()=>setShowAddCol(false)}/>}
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

function FieldRow({ label, value, onChange, ai }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
      <span style={{ fontSize:11, color:'#aaa', width:82, flexShrink:0 }}>{label}</span>
      <input value={value||''} onChange={e=>onChange(e.target.value)}
        style={{ flex:1, fontSize:13, padding:'5px 9px', border:'1px solid #E2E0DC', borderRadius:7, outline:'none', fontFamily:'inherit' }}/>
      {ai&&<span style={{ fontSize:10, padding:'2px 6px', borderRadius:20, background:'#F0EFFE', color:'#5B21B6', flexShrink:0 }}>AI</span>}
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
          ✦ Claude AI will auto-generate a description for this collection
        </div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" style={btn()} onClick={onClose}>Cancel</button>
          <button type="submit" style={btn('primary')} disabled={loading}>{loading?<Spinner size={13} color="#fff"/>:'Create collection'}</button>
        </div>
      </form>
    </Modal>
  )
}
