import { useState, useEffect, useRef } from 'react'
import { supabase, uploadGarmentImage, uploadProfileImage, tagGarment, generateCollectionDesc, generateGarmentDesc, fileToBase64 } from '../lib/supabase'
import { useAuth } from '../App'
import { SIBLogo, Avatar, StatusBadge, GarmentThumb, Empty, Spinner, Modal, useToast } from '../components/ui'

const SEASONS = ['Any','Spring','Summer','Monsoon','Festive','Winter','Bridal']

function btn(v='default') {
  const base = { display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:500, borderRadius:8, border:'1px solid', cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', transition:'all .15s' }
  if (v==='primary') return { ...base, background:'#F4622A', borderColor:'#F4622A', color:'#fff' }
  if (v==='ghost')   return { ...base, background:'transparent', borderColor:'transparent', color:'#888' }
  return { ...base, background:'#fff', borderColor:'#E2E0DC', color:'#333' }
}
const card  = { background:'#fff', border:'1px solid #E8E6E2', borderRadius:12, overflow:'hidden' }
const chead = { display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, padding:'12px 16px', borderBottom:'1px solid #F0EEE9' }

export default function Learner() {
  const { learner: authLearner, signOut } = useAuth()
  const toast = useToast()

  const [learner,      setLearner]      = useState(authLearner)
  const [garments,     setGarments]     = useState([])
  const [collections,  setCollections]  = useState([])
  const [enquiries,    setEnquiries]    = useState([])
  const [selGid,       setSelGid]       = useState(null)
  const [selEnqId,     setSelEnqId]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [tab,          setTab]          = useState('garments')
  const [showAddCol,   setShowAddCol]   = useState(false)
  const [genningDesc,  setGenningDesc]  = useState(false)
  const [editingGid,   setEditingGid]   = useState(null)
  const [editForm,     setEditForm]     = useState({})

  const fileRef  = useRef()
  const photoRef = useRef()
  const logoRef  = useRef()

  const garment    = garments.find(g => g.id === selGid)
  const selEnquiry = enquiries.find(e => e.id === selEnqId)
  const unread     = enquiries.filter(e => !e.read).length

  useEffect(() => {
    if (authLearner?.id) { loadAll(authLearner.id); setLearner(authLearner) }
    else setLoading(false)
  }, [authLearner])

  async function loadAll(lid) {
    setLoading(true)
    const [{ data:g }, { data:c }, { data:e }] = await Promise.all([
      supabase.from('garments').select('*').eq('learner_id', lid).order('created_at'),
      supabase.from('collections').select('*').eq('learner_id', lid).order('display_order'),
      supabase.from('enquiries').select('*').eq('learner_id', lid).order('created_at', { ascending: false }),
    ])
    setGarments(g||[]); setCollections(c||[]); setEnquiries(e||[])
    if (g?.length) setSelGid(g[0].id)
    setLoading(false)
  }

  const mutG = fn => setGarments(fn)
  const mutC = fn => setCollections(fn)

  async function updateLearnerField(patch) {
    setLearner(p => ({ ...p, ...patch }))
    await supabase.from('learners').update(patch).eq('id', learner.id)
  }

  async function updateGarment(gid, patch) {
    mutG(gs => gs.map(g => g.id === gid ? { ...g, ...patch } : g))
    await supabase.from('garments').update(patch).eq('id', gid)
  }

  async function updateCollection(id, patch) {
    mutC(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
    await supabase.from('collections').update(patch).eq('id', id)
  }

  async function handleUpload(file) {
    if (!file || !learner) return
    const { data:g, error } = await supabase.from('garments').insert({ learner_id: learner.id, status: 'uploading', name: file.name.replace(/\.[^.]+$/, '') }).select().single()
    if (error) { toast('Upload failed', 'error'); return }
    mutG(gs => [...gs, g]); setSelGid(g.id)
    try {
      const imageUrl = await uploadGarmentImage(learner.id, g.id, file)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, image_url: imageUrl, status: 'tagging' } : x))
      await supabase.from('garments').update({ image_url: imageUrl, status: 'tagging' }).eq('id', g.id)
      const base64 = await fileToBase64(file)
      const tags = await tagGarment(base64, file.type)
      const updates = { ...tags, name: tags.name || file.name.replace(/\.[^.]+$/, ''), status: 'tagged', ai_tagged: true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, ...updates } : x))
      toast('Garment tagged ✓', 'success')
    } catch {
      await supabase.from('garments').update({ status: 'tagged' }).eq('id', g.id)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, status: 'tagged' } : x))
    }
  }

  async function handleProfileImg(file, type) {
    if (!file || !learner) return
    try {
      const url = await uploadProfileImage(learner.id, type, file)
      await updateLearnerField(type === 'photo' ? { photo_url: url } : { logo_url: url })
      toast(`${type === 'photo' ? 'Photo' : 'Logo'} updated ✓`, 'success')
    } catch { toast('Upload failed', 'error') }
  }

  async function handleGenGarmentDesc(g) {
    setGenningDesc(true)
    try {
      const desc = await generateGarmentDesc(g.name, g.category, g.fabric, g.features)
      await updateGarment(g.id, { description: desc })
      toast('Description written ✓', 'success')
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
      learner_id: learner.id, name: form.name, season: form.season, year: form.year,
      display_order: collections.length
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    mutC(cs => [...cs, data])
    setShowAddCol(false)
    toast('Collection created!', 'success')
    const desc = await generateCollectionDesc(form.name, []).catch(() => '')
    if (desc) await updateCollection(data.id, { description: desc })
  }

  async function saveGarmentEdit(gid) {
    await updateGarment(gid, editForm)
    setEditingGid(null); setEditForm({})
    toast('Saved ✓', 'success')
  }

  async function markRead(eid) {
    await supabase.from('enquiries').update({ read: true }).eq('id', eid)
    setEnquiries(p => p.map(e => e.id === eid ? { ...e, read: true } : e))
  }

  const garmentsByCol = collections.reduce((acc, c) => {
    acc[c.id] = garments.filter(g => g.collection_id === c.id)
    return acc
  }, {})

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#0F0F0F', flexDirection:'column', gap:16 }}>
      <SIBLogo dark={true}/><Spinner size={24} color="#F4622A"/>
    </div>
  )

  if (!learner) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, background:'#0F0F0F', textAlign:'center', padding:24 }}>
      <SIBLogo dark={true}/>
      <div style={{ marginTop:20, fontSize:15, fontWeight:600, color:'#fff' }}>Account not linked</div>
      <p style={{ fontSize:13, color:'#666', maxWidth:320, lineHeight:1.5 }}>Your email isn't linked to a learner profile. Contact your Skillinabox coordinator.</p>
      <button style={btn()} onClick={signOut}>Sign out</button>
    </div>
  )

  const slug = (learner.brand||learner.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

  return (
    <div style={{ display:'grid', gridTemplateRows:'56px 1fr', gridTemplateColumns:'256px 1fr', height:'100vh', overflow:'hidden', fontFamily:"'DM Sans',sans-serif" }}>

      {/* Topbar */}
      <header style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:12, padding:'0 24px', background:'#0F0F0F', borderBottom:'1px solid #1E1E1E', zIndex:10 }}>
        <SIBLogo dark={true}/>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {learner.status==='published'&&learner.slug&&(
            <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration:'none', background:'#E6F4EC', borderColor:'#52B27A', color:'#0D6B3A', fontSize:12 }}>↗ View my portfolio</a>
          )}
          <button style={{ ...btn('ghost'), color:'#888' }} onClick={signOut}>Sign out</button>
        </div>
      </header>

      {/* Sidebar */}
      <aside style={{ background:'#131313', borderRight:'1px solid #1E1E1E', overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px', borderBottom:'1px solid #1E1E1E' }}>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:12 }}>
            {/* Photo */}
            <div style={{ position:'relative', flexShrink:0 }}>
              {learner.photo_url
                ? <img src={learner.photo_url} alt="" style={{ width:42, height:42, borderRadius:'50%', objectFit:'cover' }}/>
                : <Avatar name={learner.name} size={42}/>}
              <button onClick={()=>photoRef.current?.click()} style={{ position:'absolute', bottom:-2, right:-2, width:16, height:16, borderRadius:'50%', background:'#F4622A', border:'2px solid #131313', cursor:'pointer', fontSize:8, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
              <input ref={photoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleProfileImg(e.target.files[0],'photo'); e.target.value='' }}/>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>{learner.name}</div>
              <div style={{ fontSize:12, color:'#555' }}>{learner.brand||'No brand set'}</div>
            </div>
          </div>

          {/* Logo upload */}
          <div onClick={()=>logoRef.current?.click()} style={{ height:36, borderRadius:7, border:'1px dashed #2A2A2A', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', background:'#1A1A1A', marginBottom:10 }} title="Upload brand logo">
            {learner.logo_url
              ? <img src={learner.logo_url} alt="logo" style={{ maxHeight:'100%', maxWidth:'100%', objectFit:'contain' }}/>
              : <span style={{ fontSize:11, color:'#444' }}>+ Upload brand logo</span>}
          </div>
          <input ref={logoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleProfileImg(e.target.files[0],'logo'); e.target.value='' }}/>

          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
            {[[garments.length,'Pieces'],[enquiries.length,'Enquiries'],[enquiries.filter(e=>e.type==='order').length,'Orders']].map(([v,l])=>(
              <div key={l} style={{ padding:'8px 6px', textAlign:'center', background:'#1A1A1A', borderRadius:6 }}>
                <div style={{ fontSize:18, fontWeight:600, color:'#F4622A' }}>{v}</div>
                <div style={{ fontSize:9, color:'#444', marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {[['garments','My garments',`${garments.length} pieces`],
          ['collections','Collections',`${collections.length} created`],
          ['enquiries','Enquiries',`${unread} unread`],
          ['website','My website',learner.status==='published'?'Live ✓':'Awaiting publish']].map(([id,label,sub])=>(
          <div key={id} onClick={()=>setTab(id)}
            style={{ padding:'12px 14px', cursor:'pointer', borderBottom:'1px solid #1A1A1A', borderLeft:`3px solid ${tab===id?'#F4622A':'transparent'}`, background:tab===id?'#1A1A1A':'transparent', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:'#ddd' }}>{label}</div>
              <div style={{ fontSize:11, color:'#555', marginTop:1 }}>{sub}</div>
            </div>
            {id==='enquiries'&&unread>0&&<span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(244,98,42,.2)', color:'#F4622A', fontWeight:600 }}>{unread}</span>}
          </div>
        ))}
      </aside>

      {/* Main */}
      <main style={{ overflowY:'auto', padding:24, background:'#F7F6F4' }}>
        <div style={{ maxWidth:760 }}>

          {/* GARMENTS */}
          {tab==='garments' && <>
            <div style={card}>
              <div style={chead}>
                <div><div style={{ fontSize:13, fontWeight:600 }}>My garments</div><div style={{ fontSize:12, color:'#888', marginTop:2 }}>Upload → AI tags & writes descriptions</div></div>
                <button style={btn('primary')} onClick={()=>fileRef.current?.click()}>+ Upload garment</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleUpload(e.target.files[0]); e.target.value='' }}/>
              </div>
              {garments.length===0 ? <Empty icon="👗" title="No garments yet" action={<button style={btn('primary')} onClick={()=>fileRef.current?.click()}>Upload garment</button>}/>
                : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, padding:14 }}>
                    {garments.map((g,i)=><GarmentThumb key={g.id} garment={g} index={i} selected={selGid===g.id} onClick={()=>setSelGid(g.id)}/>)}
                  </div>}
            </div>

            {garment && (
              <div style={{ ...card, marginTop:16 }}>
                {['uploading','tagging'].includes(garment.status) ? (
                  <div style={{ padding:'40px 20px', textAlign:'center' }}>
                    <div style={{ fontSize:28, color:'#F4622A', marginBottom:12, display:'inline-block', animation:'spin 2s linear infinite' }}>✦</div>
                    <div style={{ fontSize:14, fontWeight:500 }}>{garment.status==='uploading'?'Uploading…':'Analysing with Claude AI…'}</div>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  </div>
                ) : editingGid===garment.id ? (
                  <>
                    <div style={chead}>
                      <div style={{ fontSize:14, fontWeight:600 }}>Edit garment</div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button style={btn()} onClick={()=>setEditingGid(null)}>Cancel</button>
                        <button style={btn('primary')} onClick={()=>saveGarmentEdit(garment.id)}>Save</button>
                      </div>
                    </div>
                    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                      {/* Collection assignment */}
                      <div>
                        <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Collection</label>
                        <select value={editForm.collection_id??garment.collection_id??''} onChange={e=>setEditForm(p=>({...p,collection_id:e.target.value||null}))}
                          style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, fontFamily:'inherit' }}>
                          <option value="">No collection</option>
                          {collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      {[['Garment name','name'],['Price (₹)','price'],['Description','description'],['Availability','availability'],['Sizes','sizes']].map(([l,f])=>(
                        <div key={f}>
                          <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>{l}</label>
                          <input value={editForm[f]??garment[f]??''} onChange={e=>setEditForm(p=>({...p,[f]:e.target.value}))}
                            style={{ width:'100%', fontSize:13, padding:'7px 10px', border:'1px solid #E2E0DC', borderRadius:8, outline:'none', fontFamily:'inherit' }}/>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={chead}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600 }}>{garment.name}</div>
                        <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{garment.category}{garment.fabric?` · ${garment.fabric}`:''}</div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <StatusBadge status={garment.status}/>
                        <button style={btn()} onClick={()=>{ setEditingGid(garment.id); setEditForm({}) }}>Edit</button>
                        {!garment.description&&<button style={{ ...btn(), fontSize:11 }} onClick={()=>handleGenGarmentDesc(garment)} disabled={genningDesc}>{genningDesc?<Spinner size={12} color="#F4622A"/>:'✦ AI write desc'}</button>}
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:garment.image_url?'160px 1fr':'1fr' }}>
                      {garment.image_url&&<div style={{ padding:14, borderRight:'1px solid #F0EEE9' }}><img src={garment.image_url} alt="" style={{ width:'100%', borderRadius:8, objectFit:'cover', aspectRatio:'3/4' }}/></div>}
                      <div style={{ padding:16 }}>
                        {[['Price',garment.price?`₹${Number(garment.price).toLocaleString('en-IN')}`:'Not set — tap Edit to add'],['Availability',garment.availability],['Sizes',garment.sizes],['Occasion',garment.occasion]].map(([l,v])=>v?(
                          <div key={l} style={{ marginBottom:10 }}>
                            <div style={{ fontSize:11, color:'#aaa' }}>{l}</div>
                            <div style={{ fontSize:13, fontWeight:l==='Price'?600:400, color:l==='Price'&&garment.price?'#C94E1E':'#333' }}>{v}</div>
                          </div>
                        ):null)}
                        {garment.description&&<div style={{ fontSize:13, color:'#555', lineHeight:1.6, marginTop:8 }}>{garment.description}</div>}
                        {!garment.price&&<div style={{ fontSize:12, color:'#92400E', background:'#FEF3E2', padding:'6px 12px', borderRadius:7, display:'inline-block', marginTop:8 }}>Set a price to show on your portfolio</div>}
                        {collections.length>0&&<div style={{ fontSize:12, color:'#888', marginTop:8 }}>Collection: {collections.find(c=>c.id===garment.collection_id)?.name||'None'}</div>}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>}

          {/* COLLECTIONS */}
          {tab==='collections' && <>
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
              <button style={btn('primary')} onClick={()=>setShowAddCol(true)}>+ New collection</button>
            </div>
            {collections.length===0 ? (
              <div style={{ ...card, padding:'48px 24px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12, opacity:.3 }}>◈</div>
                <div style={{ fontSize:15, fontWeight:500, color:'#555', marginBottom:8 }}>No collections yet</div>
                <div style={{ fontSize:13, color:'#aaa', marginBottom:20 }}>Create collections to group your garments on your portfolio</div>
                <button style={btn('primary')} onClick={()=>setShowAddCol(true)}>+ Create collection</button>
              </div>
            ) : collections.map(col=>(
              <div key={col.id} style={{ ...card, marginBottom:16 }}>
                <div style={chead}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:600 }}>{col.name}</div>
                    <div style={{ fontSize:12, color:'#aaa', marginTop:2 }}>{col.season} {col.year} · {garmentsByCol[col.id]?.length||0} garments</div>
                  </div>
                  <button style={{ ...btn(), fontSize:11 }} onClick={()=>handleGenColDesc(col)}>✦ AI description</button>
                </div>
                <div style={{ padding:'12px 16px 0' }}>
                  <textarea value={col.description} onChange={e=>updateCollection(col.id,{description:e.target.value})}
                    placeholder="Click '✦ AI description' to generate a collection description"
                    style={{ width:'100%', fontSize:13, color:'#555', border:'1px solid #F0EEE9', borderRadius:8, padding:'10px 12px', resize:'vertical', minHeight:60, outline:'none', fontFamily:'inherit', lineHeight:1.6 }}/>
                </div>
                <div style={{ padding:'10px 14px 14px' }}>
                  {(garmentsByCol[col.id]?.length||0)===0
                    ? <div style={{ fontSize:13, color:'#ccc', fontStyle:'italic' }}>No garments yet — edit a garment and assign it to this collection</div>
                    : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))', gap:8 }}>
                        {garmentsByCol[col.id].map((g,i)=><GarmentThumb key={g.id} garment={g} index={i} onClick={()=>{ setTab('garments'); setSelGid(g.id) }}/>)}
                      </div>}
                </div>
              </div>
            ))}
          </>}

          {/* ENQUIRIES */}
          {tab==='enquiries' && (
            <div style={card}>
              <div style={chead}><div style={{ fontSize:13, fontWeight:600 }}>Enquiries & orders</div><span style={{ fontSize:12, color:'#888' }}>{enquiries.length} total · {unread} unread</span></div>
              {enquiries.length===0 ? <Empty icon="✉" title="No enquiries yet" message="Share your portfolio link to start receiving enquiries."/> : (
                <div style={{ display:'grid', gridTemplateColumns:selEnqId?'1fr 300px':'1fr' }}>
                  <div style={{ borderRight:selEnqId?'1px solid #F0EEE9':'none' }}>
                    {enquiries.map(e=>(
                      <div key={e.id} onClick={()=>{ setSelEnqId(selEnqId===e.id?null:e.id); markRead(e.id) }}
                        style={{ padding:'13px 18px', borderBottom:'1px solid #F5F3F0', display:'flex', gap:12, cursor:'pointer', background:selEnqId===e.id?'#FEF8F6':e.read?'transparent':'#FFFAF8' }}>
                        <div style={{ width:7, height:7, borderRadius:'50%', background:e.read?'transparent':'#F4622A', marginTop:5, flexShrink:0 }}/>
                        <Avatar name={e.from_name} size={32}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:3 }}>
                            <span style={{ fontSize:13, fontWeight:600 }}>{e.from_name}</span>
                            <StatusBadge status={e.type}/>
                            {e.measurements&&<span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:'#E6F4EC', color:'#0D6B3A', fontWeight:500 }}>📏 Measurements</span>}
                          </div>
                          {e.garment_name&&<div style={{ fontSize:12, color:'#aaa', marginBottom:3 }}>{e.garment_name}</div>}
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
                      <div style={{ fontSize:13, color:'#555', lineHeight:1.65, marginBottom:14 }}>{selEnquiry.message}</div>
                      {selEnquiry.measurements&&(
                        <div style={{ background:'#F0EDEA', borderRadius:10, padding:14, marginBottom:14 }}>
                          <div style={{ fontSize:11, fontWeight:600, color:'#888', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>📏 Measurements</div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                            {Object.entries(selEnquiry.measurements).filter(([,v])=>v).map(([k,v])=>(
                              <div key={k}><div style={{ fontSize:10, color:'#aaa' }}>{k}</div><div style={{ fontSize:13, fontWeight:500 }}>{v}"</div></div>
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

          {/* WEBSITE */}
          {tab==='website' && (
            <div style={card}>
              <div style={chead}>
                <div><div style={{ fontSize:13, fontWeight:600 }}>My portfolio website</div><div style={{ fontSize:12, color:'#888', marginTop:2 }}>{learner.status==='published'?'Live and shareable':'Awaiting publish from coordinator'}</div></div>
                {learner.status==='published'&&learner.slug&&<a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration:'none', background:'#E6F4EC', borderColor:'#52B27A', color:'#0D6B3A' }}>View ↗</a>}
              </div>
              {learner.status==='published'&&learner.slug ? (
                <div style={{ padding:18 }}>
                  <div style={{ background:'#F7F6F4', borderRadius:9, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                    <div>
                      <div style={{ fontSize:11, color:'#aaa', marginBottom:3 }}>Your portfolio URL</div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#1D4ED8' }}>{window.location.origin}/portfolio/{learner.slug}</div>
                    </div>
                    <button style={btn()} onClick={()=>{ navigator.clipboard.writeText(`${window.location.origin}/portfolio/${learner.slug}`); toast('Copied!','success') }}>Copy</button>
                  </div>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`Check out my fashion portfolio: ${window.location.origin}/portfolio/${learner.slug}`)}`} target="_blank" rel="noreferrer" style={{ ...btn(), textDecoration:'none', background:'#E6F4EC', borderColor:'#52B27A', color:'#0D6B3A' }}>Share on WhatsApp</a>
                </div>
              ) : (
                <div style={{ padding:'48px 24px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>🎨</div>
                  <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Portfolio not live yet</div>
                  <p style={{ fontSize:13, color:'#888', lineHeight:1.6, maxWidth:300, margin:'0 auto' }}>Once your garments are reviewed, your coordinator will publish your portfolio.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {showAddCol && <AddCollectionModal onAdd={addCollection} onClose={()=>setShowAddCol(false)}/>}
    </div>
  )
}

function AddCollectionModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:'', season:'', year:new Date().getFullYear().toString() })
  const [loading, setLoading] = useState(false)
  async function submit(e) { e.preventDefault(); setLoading(true); await onAdd(form); setLoading(false) }
  const s = { display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:500, borderRadius:8, border:'1px solid', cursor:'pointer', fontFamily:'inherit' }
  return (
    <Modal title="New collection" onClose={onClose} width={380}>
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
        <div style={{ fontSize:12, color:'#888', padding:'8px 12px', background:'#F7F6F4', borderRadius:9 }}>✦ AI will auto-generate a description</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" style={{ ...s, background:'#fff', borderColor:'#E2E0DC', color:'#333' }} onClick={onClose}>Cancel</button>
          <button type="submit" style={{ ...s, background:'#F4622A', borderColor:'#F4622A', color:'#fff' }} disabled={loading}>{loading?<Spinner size={13} color="#fff"/>:'Create'}</button>
        </div>
      </form>
    </Modal>
  )
}
