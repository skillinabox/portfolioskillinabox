import { useState, useEffect, useRef } from 'react'
import { supabase, uploadGarmentImage, uploadProfileImage, tagGarment, generateCollectionDesc, generateGarmentDesc, fileToBase64 } from '../lib/supabase'
import { checkExpiry, canPerform, incrementUsage, getUsage, getActiveSubscription, getPlans } from '../lib/subscription'
import { useAuth } from '../App'
import { SIBLogo, Avatar, StatusBadge, GarmentThumb, Empty, Spinner, Modal, useToast } from '../components/ui'
import SubscriptionPage from './Subscription'

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
  const [activeSub,    setActiveSub]    = useState(null)
  const [usage,        setUsage]        = useState({ garments_used:0, poses_used:0 })

  const [showUpgrade,  setShowUpgrade]  = useState(null) // { feature, used, limit }

  const fileRef  = useRef()
  const photoRef = useRef()
  const logoRef  = useRef()

  const garment    = garments.find(g => g.id === selGid)
  const selEnquiry = enquiries.find(e => e.id === selEnqId)
  const unread     = enquiries.filter(e => !e.read).length

  const subStatus = learner?.subscription_status || 'none'
  const hasAccess = ['active','trial'].includes(subStatus) && learner?.subscription_end && new Date(learner.subscription_end) > new Date()

  useEffect(() => {
    if (authLearner?.id) {
      loadAll(authLearner.id)
      setLearner(authLearner)
      checkExpiry(authLearner.id)
      getActiveSubscription(authLearner.id).then(setActiveSub)
      getUsage(authLearner.id).then(setUsage)
    }
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

    // Always allow upload — but gate LIA tagging on subscription
    const access = await canPerform(learner.id, 'upload_garment')
    const liaLocked = !access.allowed

    // If limit reached, show upgrade modal
    if (!access.allowed && access.reason === 'garment_limit_reached') {
      setShowUpgrade({ feature: 'garments', used: access.used, limit: access.limit }); return
    }

    // Save garment (always allowed)
    const { data:g, error } = await supabase.from('garments').insert({
      learner_id: learner.id, status: 'uploading', name: file.name.replace(/\.[^.]+$/, '')
    }).select().single()
    if (error) { toast('Upload failed', 'error'); return }
    mutG(gs => [...gs, g]); setSelGid(g.id)

    // Upload image (always)
    try {
      const imageUrl = await uploadGarmentImage(learner.id, g.id, file)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, image_url: imageUrl, status: liaLocked ? 'uploaded' : 'tagging' } : x))
      await supabase.from('garments').update({ image_url: imageUrl, status: liaLocked ? 'uploaded' : 'tagging' }).eq('id', g.id)

      if (liaLocked) {
        // Garment saved but LIA locked — show upgrade prompt
        toast('Garment uploaded! Subscribe to unlock LIA tagging & poses.', 'default')
        return
      }

      // LIA tagging (subscription active)
      await incrementUsage(learner.id, 'garments')
      const base64 = await fileToBase64(file)
      const tags = await tagGarment(base64, file.type)
      const updates = { ...tags, name: tags.name || file.name.replace(/\.[^.]+$/, ''), status: 'tagged', ai_tagged: true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      mutG(gs => gs.map(x => x.id === g.id ? { ...x, ...updates } : x))
      toast('LIA tagged ✓', 'success')
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

  async function handleGenGarmentPoses(g) {
    const access = await canPerform(learner.id, 'generate_pose')
    if (!access.allowed) {
      if (access.reason === 'pose_limit_reached') {
        setShowUpgrade({ feature: 'poses', used: access.used, limit: access.limit }); return
      }
      setTab('subscription'); return
    }
    try {
      const res = await fetch('/api/submit-poses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ garment_image_url: g.image_url, gender: g.gender || 'female' }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await updateGarment(g.id, { pending_poses: data.prediction_ids })
      toast('Generating poses — safe to switch screens ✓', 'default')
    } catch(err) { toast(err.message || 'Failed', 'error') }
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
              <div style={{ marginTop:4 }}>
                {subStatus==='active' && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#E6F4EC', color:'#0D6B3A', fontWeight:500 }}>✓ {activeSub?.subscription_plans?.name||'Active'}</span>}
                {subStatus==='trial' && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#FEF3E2', color:'#92400E', fontWeight:500 }}>🎁 Free trial</span>}
                {subStatus==='expired' && <button onClick={()=>setShowUpgrade(true)} style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#FEE2E2', color:'#991B1B', fontWeight:500, border:'none', cursor:'pointer', fontFamily:'inherit' }}>⚠ Renew</button>}
                {subStatus==='none' && <button onClick={()=>setShowUpgrade(true)} style={{ fontSize:10, padding:'2px 8px', borderRadius:99, background:'#FEF0EA', color:'#C94E1E', fontWeight:500, border:'none', cursor:'pointer', fontFamily:'inherit' }}>Subscribe →</button>}
              </div>
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
          ['website','My website',learner.status==='published'?'Live ✓':'Awaiting publish'],
          ['subscription','Subscription', hasAccess ? (activeSub?.status==='trial'?'Free trial':'Active ✓') : subStatus==='expired'?'⚠ Expired':'Not subscribed']].map(([id,label,sub])=>(
          <div key={id} onClick={()=>setTab(id)}
            style={{ padding:'12px 14px', cursor:'pointer', borderBottom:'1px solid #1A1A1A', borderLeft:`3px solid ${tab===id?'#F4622A':id==='subscription'&&!hasAccess?'#F4622A44':'transparent'}`, background:tab===id?'#1A1A1A':id==='subscription'&&!hasAccess?'rgba(244,98,42,.05)':'transparent', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color: id==='subscription'&&!hasAccess?'#F4622A':'#ddd' }}>{label}</div>
              <div style={{ fontSize:11, color: id==='subscription'&&subStatus==='expired'?'#C94E1E':id==='subscription'&&!hasAccess?'#F4622A88':'#555', marginTop:1 }}>{sub}</div>
            </div>
            {id==='enquiries'&&unread>0&&<span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(244,98,42,.2)', color:'#F4622A', fontWeight:600 }}>{unread}</span>}
            {id==='subscription'&&!hasAccess&&<span style={{ fontSize:9, padding:'2px 8px', borderRadius:99, background:'#F4622A', color:'#fff', fontWeight:600 }}>UPGRADE</span>}
          </div>
        ))}
      </aside>

      {/* Main */}
      <main style={{ overflowY:'auto', padding:24, background:'#F7F6F4' }}>
        <div style={{ maxWidth:760 }}>

          {/* GARMENTS */}
          {tab==='garments' && <>

            {/* Subscription status card */}
            <SubStatusCard
              learner={learner}
              activeSub={activeSub}
              usage={usage}
              hasAccess={hasAccess}
              subStatus={subStatus}
              onUpgrade={()=>setShowUpgrade(true)}
            />

            <div style={card}>
              <div style={chead}>
                <div><div style={{ fontSize:13, fontWeight:600 }}>My garments</div><div style={{ fontSize:12, color:'#888', marginTop:2 }}>Upload → LIA tags & writes descriptions</div></div>
                <button style={btn('primary')} onClick={()=>fileRef.current?.click()}>+ Upload garment</button>
                <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleUpload(e.target.files[0]); e.target.value='' }}/>
              </div>
              {garments.length===0 ? <Empty icon="👗" title="No garments yet" action={<button style={btn('primary')} onClick={()=>fileRef.current?.click()}>Upload garment</button>}/>
                : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, padding:14 }}>
                    {garments.map((g,i)=>(
                      <div key={g.id} style={{ position:'relative' }}>
                        <GarmentThumb garment={g} index={i} selected={selGid===g.id} onClick={()=>setSelGid(g.id)}/>
                        {g.status==='uploaded' && (
                          <div onClick={()=>setShowUpgrade({feature:'lia'})}
                            style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', gap:4 }}>
                            <div style={{ fontSize:18 }}>🔒</div>
                            <div style={{ fontSize:10, color:'#fff', fontWeight:600, textAlign:'center', padding:'0 8px' }}>Upgrade to tag</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>}
            </div>

            {garment && (
              <div style={{ ...card, marginTop:16 }}>
                {['uploading','tagging'].includes(garment.status) ? (
                  <div style={{ padding:'40px 20px', textAlign:'center' }}>
                    <div style={{ fontSize:28, color:'#F4622A', marginBottom:12, display:'inline-block', animation:'spin 2s linear infinite' }}>✦</div>
                    <div style={{ fontSize:14, fontWeight:500 }}>{garment.status==='uploading'?'Uploading…':'LIA is reading your garment…'}</div>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                  </div>
                ) : (
                  <>
                    <div style={chead}>
                      <div>
                        <div style={{ fontSize:14, fontWeight:600 }}>{garment.name||'Garment details'}</div>
                        <div style={{ fontSize:12, color:'#888', marginTop:2 }}>{garment.ai_tagged ? 'LIA auto-filled · all fields editable' : 'Fill in your garment details'}</div>
                      </div>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <StatusBadge status={garment.status}/>
                        <button style={btn()} onClick={()=>{ setEditingGid(garment.id); setEditForm({}) }}>Edit details</button>
                      </div>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:garment.image_url?'180px 1fr':'1fr' }}>
                      {garment.image_url && (
                        <div style={{ padding:14, borderRight:'1px solid #F0EEE9' }}>
                          <img src={garment.image_url} alt="" style={{ width:'100%', borderRadius:8, objectFit:'cover', aspectRatio:'3/4', display:'block' }}/>
                        </div>
                      )}

                      <div style={{ padding:'14px 16px', position:'relative' }}>

                        {/* Collection */}
                        <div style={{ marginBottom:12 }}>
                          <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:4 }}>Collection</label>
                          <select value={garment.collection_id||''} onChange={e=>updateGarment(garment.id,{collection_id:e.target.value||null})}
                            style={{ width:'100%', fontSize:13, padding:'6px 10px', border:'1px solid #E2E0DC', borderRadius:8, background:'#fff', fontFamily:'inherit' }}>
                            <option value="">No collection</option>
                            {collections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </div>

                        {/* Gender toggle */}
                        <div style={{ marginBottom:14 }}>
                          <label style={{ fontSize:11, color:'#aaa', display:'block', marginBottom:6 }}>Model gender for LIA poses</label>
                          <div style={{ display:'flex', gap:6 }}>
                            {[['female','👩 Female'],['male','👨 Male'],['unisex','✦ Unisex']].map(([g,label])=>(
                              <button key={g} onClick={()=>updateGarment(garment.id,{gender:g})}
                                style={{ flex:1, padding:'7px 6px', fontSize:12, fontWeight:500, borderRadius:8, border:`1px solid ${(garment.gender||'female')===g?'#F4622A':'#E2E0DC'}`, background:(garment.gender||'female')===g?'#FEF0EA':'#fff', color:(garment.gender||'female')===g?'#C94E1E':'#888', cursor:'pointer', fontFamily:'inherit' }}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* LIA fields — blurred if no subscription */}
                        <div style={{ position:'relative' }}>
                          <div style={{ filter: !hasAccess && garment.status==='uploaded' ? 'blur(4px)' : 'none', pointerEvents: !hasAccess && garment.status==='uploaded' ? 'none' : 'auto', userSelect: !hasAccess && garment.status==='uploaded' ? 'none' : 'auto' }}>
                            <div style={{ fontSize:11, fontWeight:600, color:'#aaa', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:10 }}>LIA-detected details</div>
                            {[['Garment name','name'],['Category','category'],['Fabric','fabric'],['Key features','features'],['Colour','colour'],['Occasion','occasion']].map(([l,f])=>(
                              <div key={f} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                <span style={{ fontSize:11, color:'#aaa', width:90, flexShrink:0 }}>{l}</span>
                                <div style={{ flex:1, fontSize:13, padding:'5px 9px', border:'1px solid #E2E0DC', borderRadius:7, background:'#FAFAFA', color:'#555', minHeight:30 }}>{garment[f]||'—'}</div>
                                {garment.ai_tagged && <span style={{ fontSize:10, padding:'2px 6px', borderRadius:20, background:'#F0EFFE', color:'#5B21B6', flexShrink:0 }}>LIA</span>}
                              </div>
                            ))}
                            <div style={{ fontSize:11, fontWeight:600, color:'#aaa', textTransform:'uppercase', letterSpacing:'.05em', margin:'14px 0 10px' }}>Pricing & availability</div>
                            {[['Price (₹)','price'],['Sizes','sizes'],['Availability','availability']].map(([l,f])=>(
                              <div key={f} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                <span style={{ fontSize:11, color:'#aaa', width:90, flexShrink:0 }}>{l}</span>
                                <div style={{ flex:1, fontSize:13, padding:'5px 9px', border:'1px solid #E2E0DC', borderRadius:7, background:'#FAFAFA', color:'#555', minHeight:30 }}>{f==='price'&&garment[f]?`₹${Number(garment[f]).toLocaleString('en-IN')}`:garment[f]||'—'}</div>
                              </div>
                            ))}
                            <div style={{ marginTop:12 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                                <span style={{ fontSize:11, color:'#aaa' }}>Description</span>
                                {hasAccess && <button style={{ ...btn(), fontSize:11, padding:'4px 10px' }} onClick={()=>handleGenGarmentDesc(garment)} disabled={genningDesc}>{genningDesc?<Spinner size={12} color="#F4622A"/>:'✦ LIA write'}</button>}
                              </div>
                              <div style={{ fontSize:13, color:'#555', lineHeight:1.65, padding:'8px 10px', border:'1px solid #E2E0DC', borderRadius:8, minHeight:64, background:'#FAFAFA' }}>
                                {garment.description || <span style={{ color:'#ccc' }}>No description yet</span>}
                              </div>
                            </div>
                          </div>

                          {/* Blur overlay for unsubscribed */}
                          {!hasAccess && garment.status==='uploaded' && (
                            <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, background:'rgba(255,255,255,.7)', borderRadius:10 }}>
                              <div style={{ fontSize:28 }}>🔒</div>
                              <div style={{ fontSize:14, fontWeight:600, color:'#111', textAlign:'center' }}>LIA Pro required</div>
                              <div style={{ fontSize:12, color:'#888', textAlign:'center', maxWidth:220, lineHeight:1.5 }}>Subscribe to unlock auto-tagging, descriptions and pose generation</div>
                              <button onClick={()=>setTab('subscription')}
                                style={{ padding:'10px 24px', fontSize:13, fontWeight:600, background:'#F4622A', border:'none', borderRadius:10, color:'#fff', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 16px rgba(244,98,42,.25)' }}>
                                Unlock LIA Pro →
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {/* LIA Poses — full version matching admin */}
                    <LearnerPoseSection garment={garment} hasAccess={hasAccess} onUpdate={updateGarment} onUpgrade={()=>setTab('subscription')} toast={toast}/>
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
                  <button style={{ ...btn(), fontSize:11 }} onClick={()=>handleGenColDesc(col)}>✦ LIA description</button>
                </div>
                <div style={{ padding:'12px 16px 0' }}>
                  <textarea value={col.description} onChange={e=>updateCollection(col.id,{description:e.target.value})}
                    placeholder="Click '✦ LIA description' to generate a collection description"
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
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

              {/* Preview card - always available */}
              <div style={card}>
                <div style={chead}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>Preview my portfolio</div>
                    <div style={{ fontSize:12, color:'#888', marginTop:2 }}>See exactly how your portfolio looks to customers</div>
                  </div>
                  <a href={`/portfolio/preview/${learner.id}`} target="_blank" rel="noreferrer"
                    style={{ ...btn(), textDecoration:'none', background:'#F0EFFE', borderColor:'#9B87F5', color:'#5B21B6' }}>
                    👁 Preview site ↗
                  </a>
                </div>
                <div style={{ padding:'12px 16px', display:'flex', gap:10, flexWrap:'wrap' }}>
                  {[
                    [`${garments.length} garment${garments.length!==1?'s':''}`, garments.length>0?'#0D6B3A':'#aaa'],
                    [`${garments.filter(g=>g.poses&&Object.values(g.poses).some(Boolean)).length} with LIA poses`, '#5B21B6'],
                    [`${collections.length} collection${collections.length!==1?'s':''}`, collections.length>0?'#0D6B3A':'#aaa'],
                  ].map(([label,color])=>(
                    <span key={label} style={{ fontSize:12, color, background:'#F7F6F4', padding:'4px 10px', borderRadius:99 }}>{label}</span>
                  ))}
                </div>
              </div>

              {/* Publish card - gated by subscription */}
              <div style={card}>
                <div style={chead}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>
                      {learner.status==='published' ? '✓ Portfolio is live' : 'Publish my portfolio'}
                    </div>
                    <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
                      {learner.status==='published'
                        ? 'Your portfolio is publicly accessible at the URL below'
                        : hasAccess ? 'Ready to go live — publish your portfolio to the world' : 'Requires an active subscription'}
                    </div>
                  </div>
                  {learner.status==='published' && learner.slug && (
                    <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer"
                      style={{ ...btn(), textDecoration:'none', background:'#E6F4EC', borderColor:'#52B27A', color:'#0D6B3A' }}>
                      View live ↗
                    </a>
                  )}
                </div>

                {!hasAccess && learner.status !== 'published' ? (
                  // Locked state
                  <div style={{ padding:'28px 20px', textAlign:'center' }}>
                    <div style={{ fontSize:28, marginBottom:12 }}>🔒</div>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Subscribe to publish</div>
                    <div style={{ fontSize:13, color:'#888', lineHeight:1.6, maxWidth:320, margin:'0 auto 20px' }}>
                      An active LIA Pro subscription is required to make your portfolio publicly visible to customers.
                    </div>
                    <button onClick={()=>setTab('subscription')}
                      style={{ padding:'11px 24px', fontSize:13, fontWeight:600, background:'#F4622A', border:'none', borderRadius:10, color:'#fff', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 16px rgba(244,98,42,.25)' }}>
                      See plans & subscribe →
                    </button>
                  </div>
                ) : learner.status === 'published' && learner.slug ? (
                  // Published state
                  <div style={{ padding:18 }}>
                    <div style={{ background:'#F7F6F4', borderRadius:9, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:11, color:'#aaa', marginBottom:3 }}>Your portfolio URL</div>
                        <div style={{ fontSize:14, fontWeight:600, color:'#1D4ED8' }}>{window.location.origin}/portfolio/{learner.slug}</div>
                      </div>
                      <button style={btn()} onClick={()=>{ navigator.clipboard.writeText(`${window.location.origin}/portfolio/${learner.slug}`); toast('Copied!','success') }}>Copy</button>
                    </div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <a href={`https://wa.me/?text=${encodeURIComponent(`Check out my fashion portfolio: ${window.location.origin}/portfolio/${learner.slug}`)}`}
                        target="_blank" rel="noreferrer"
                        style={{ ...btn(), textDecoration:'none', background:'#E6F4EC', borderColor:'#52B27A', color:'#0D6B3A' }}>
                        Share on WhatsApp
                      </a>
                      <a href={`https://www.instagram.com/`} target="_blank" rel="noreferrer"
                        style={{ ...btn(), textDecoration:'none' }}>
                        Share on Instagram
                      </a>
                      <PublishButton learner={learner} garments={garments} hasAccess={hasAccess} onPublished={slug=>{ setLearner(p=>({...p,status:'published',slug})) }} toast={toast}/>
                    </div>
                  </div>
                ) : (
                  // Ready to publish
                  <div style={{ padding:'24px 20px', textAlign:'center' }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>🚀</div>
                    <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Ready to go live!</div>
                    <div style={{ fontSize:13, color:'#888', lineHeight:1.6, maxWidth:320, margin:'0 auto 20px' }}>
                      {garments.filter(g=>g.status==='tagged').length} tagged garments ready to publish.
                    </div>
                    <PublishButton learner={learner} garments={garments} hasAccess={hasAccess} onPublished={slug=>{ setLearner(p=>({...p,status:'published',slug})) }} toast={toast}/>
                  </div>
                )}
              </div>

              {/* Share kit */}
              {learner.status==='published' && learner.slug && (
                <div style={card}>
                  <div style={chead}><div style={{ fontSize:13, fontWeight:600 }}>Share kit</div><div style={{ fontSize:12, color:'#888' }}>Ready-made captions to copy</div></div>
                  <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                    {[
                      ['WhatsApp caption', `Hi! Check out my fashion portfolio 👗✨\n${window.location.origin}/portfolio/${learner.slug}\nEnquiries welcome!`],
                      ['Instagram bio link', `${window.location.origin}/portfolio/${learner.slug}`],
                    ].map(([label, text])=>(
                      <div key={label} style={{ background:'#F7F6F4', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                          <span style={{ fontSize:11, fontWeight:600, color:'#888' }}>{label}</span>
                          <button style={{ ...btn(), fontSize:11, padding:'3px 10px' }} onClick={()=>{ navigator.clipboard.writeText(text); toast('Copied!','success') }}>Copy</button>
                        </div>
                        <div style={{ fontSize:12, color:'#555', lineHeight:1.6, whiteSpace:'pre-wrap' }}>{text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUBSCRIPTION */}
          {tab==='subscription' && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <SubscriptionPage
                learner={learner}
                onSubscribed={()=>{
                  getActiveSubscription(learner.id).then(setActiveSub)
                  getUsage(learner.id).then(setUsage)
                }}
              />
            </div>
          )}
        </div>
      </main>

      {/* Expired subscription overlay on garments/collections tabs */}
      {!hasAccess && subStatus !== 'none' && ['garments','collections'].includes(tab) && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'#1A1A1A', color:'#fff', borderRadius:12, padding:'14px 20px', display:'flex', alignItems:'center', gap:14, boxShadow:'0 8px 32px rgba(0,0,0,.4)', zIndex:50, maxWidth:480, width:'calc(100% - 48px)' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>
              {subStatus==='expired' ? '⚠ Subscription expired' : 'No active subscription'}
            </div>
            <div style={{ fontSize:12, color:'#888' }}>Portfolio unpublished · LIA features disabled</div>
          </div>
          <button onClick={()=>setShowUpgrade(true)} style={{ padding:'8px 16px', fontSize:12, fontWeight:600, background:'#F4622A', border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
            Subscribe now →
          </button>
        </div>
      )}

      {showAddCol && <AddCollectionModal onAdd={addCollection} onClose={()=>setShowAddCol(false)}/>}

      {showUpgrade && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:0 }}
          onClick={e=>e.target===e.currentTarget&&setShowUpgrade(false)}>
          <div style={{ background:'#fff', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:640, maxHeight:'90vh', overflow:'auto', boxShadow:'0 -8px 40px rgba(0,0,0,.3)' }}>
            <div style={{ padding:'14px 20px', borderBottom:'1px solid #F0EEE9', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:'#fff' }}>
              <div>
                <div style={{ fontSize:15, fontWeight:600 }}>
                  {subStatus==='expired' ? 'Renew your subscription' : subStatus==='trial' ? 'Upgrade to full access' : 'Choose a plan'}
                </div>
                <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Unlock LIA tagging, pose generation and portfolio publishing</div>
              </div>
              <button onClick={()=>setShowUpgrade(false)} style={{ background:'none', border:'none', fontSize:24, cursor:'pointer', color:'#aaa', lineHeight:1, padding:0 }}>×</button>
            </div>
            <div style={{ padding:20 }}>
              <SubscriptionPage
                learner={learner}
                onSubscribed={()=>{
                  setShowUpgrade(false)
                  getActiveSubscription(learner.id).then(setActiveSub)
                  getUsage(learner.id).then(setUsage)
                  window.location.reload()
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Publish Button ─────────────────────────────────────────────
function PublishButton({ learner, garments, hasAccess, onPublished, toast }) {
  const [publishing, setPublishing] = useState(false)

  async function handlePublish() {
    if (!hasAccess) return
    setPublishing(true)
    try {
      const slug = (learner.brand||learner.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
      const toPublish = garments.filter(g => ['tagged','ready'].includes(g.status))
      if (toPublish.length) {
        await supabase.from('garments').update({ status:'published' }).in('id', toPublish.map(g=>g.id))
      }
      await supabase.from('learners').update({ status:'published', slug }).eq('id', learner.id)
      onPublished(slug)
      toast('Portfolio published! ↗', 'success')
    } catch(e) { toast(e.message||'Failed', 'error') }
    setPublishing(false)
  }

  return (
    <button onClick={handlePublish} disabled={publishing||!hasAccess}
      style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'9px 20px', fontSize:13, fontWeight:600, background: hasAccess?'#F4622A':'#ccc', border:'none', borderRadius:10, color:'#fff', cursor:hasAccess?'pointer':'not-allowed', fontFamily:'inherit' }}>
      {publishing ? <><Spinner size={13} color="#fff"/> Publishing…</> : learner.status==='published' ? '↻ Republish' : '↗ Publish portfolio'}
    </button>
  )
}

// ── Subscription Status Card ──────────────────────────────────
function SubStatusCard({ learner, activeSub, usage, hasAccess, subStatus, onUpgrade }) {
  const daysLeft = activeSub ? Math.max(0, Math.ceil((new Date(activeSub.end_date) - new Date()) / 86400000)) : 0
  const plan = activeSub?.subscription_plans

  if (subStatus === 'none') return (
    <div style={{ background:'linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 100%)', borderRadius:12, padding:'18px 20px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, fontWeight:600, color:'#fff', marginBottom:4 }}>Unlock LIA features</div>
        <div style={{ fontSize:12, color:'#666', lineHeight:1.6 }}>Subscribe to enable LIA auto-tagging, pose generation, and publish your portfolio to the world.</div>
      </div>
      <button onClick={onUpgrade} style={{ padding:'10px 20px', fontSize:13, fontWeight:600, background:'#F4622A', border:'none', borderRadius:10, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', boxShadow:'0 4px 16px rgba(244,98,42,.3)' }}>
        View plans →
      </button>
    </div>
  )

  if (subStatus === 'expired') return (
    <div style={{ background:'#FEF2F2', border:'1px solid #FCA5A5', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap' }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#991B1B', marginBottom:3 }}>⚠ Subscription expired</div>
        <div style={{ fontSize:12, color:'#B91C1C' }}>LIA features paused · Your portfolio is unpublished · Renew to reactivate</div>
      </div>
      <button onClick={onUpgrade} style={{ padding:'9px 18px', fontSize:12, fontWeight:600, background:'#DC2626', border:'none', borderRadius:9, color:'#fff', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Renew now →</button>
    </div>
  )

  if (!hasAccess || !plan) return null

  const gPct = plan.garment_limit > 0 ? Math.min(100, Math.round((usage.garments_used / plan.garment_limit) * 100)) : 0
  const pPct = plan.pose_limit > 0 ? Math.min(100, Math.round((usage.poses_used / plan.pose_limit) * 100)) : 0

  return (
    <div style={{ background:'#fff', border:'1px solid #E8E6E2', borderRadius:12, padding:'14px 18px' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background: subStatus==='trial'?'#F59E0B':'#22C55E' }}/>
          <span style={{ fontSize:13, fontWeight:600, color:'#111' }}>
            {subStatus==='trial' ? '🎁 Free trial' : plan.name}
          </span>
          <span style={{ fontSize:11, color:'#888' }}>· {daysLeft} day{daysLeft!==1?'s':''} left</span>
          {daysLeft <= 7 && <span style={{ fontSize:11, color:'#C94E1E', fontWeight:500 }}>⚠ Renewing soon</span>}
        </div>
        <button onClick={onUpgrade} style={{ fontSize:11, padding:'4px 12px', borderRadius:99, border:'1px solid #F4622A', background:'transparent', color:'#F4622A', cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
          {subStatus==='trial' ? 'Upgrade plan' : 'Manage'}
        </button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {[[`Garments`, usage.garments_used, plan.garment_limit, gPct],
          [`LIA poses`, usage.poses_used, plan.pose_limit, pPct]].map(([label, used, limit, pct])=>(
          <div key={label}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ fontSize:11, color:'#888' }}>{label} this month</span>
              <span style={{ fontSize:11, fontWeight:600, color: pct>=80?'#C94E1E':'#333' }}>{used} / {limit===-1?'∞':limit}</span>
            </div>
            <div style={{ height:5, background:'#F0EEE9', borderRadius:99, overflow:'hidden' }}>
              {limit > 0 && <div style={{ height:'100%', width:`${pct}%`, background: pct>=80?'#C94E1E':'#F4622A', borderRadius:99, transition:'width .4s' }}/>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Upgrade Modal ─────────────────────────────────────────────
function UpgradeModal({ feature, used, limit, onClose, onUpgrade }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:420, padding:32, textAlign:'center' }}>
        <div style={{ width:56, height:56, borderRadius:'50%', background:'#FEF0EA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 16px' }}>🔒</div>
        <div style={{ fontFamily:"'DM Serif Display',serif", fontSize:22, color:'#111', marginBottom:8 }}>
          {feature === 'garments' ? 'Monthly limit reached' : 'LIA Pro required'}
        </div>
        <div style={{ fontSize:14, color:'#888', lineHeight:1.7, marginBottom:24 }}>
          {feature === 'garments'
            ? `You've used ${used} of ${limit} garments this month. Upgrade your plan to upload more.`
            : 'LIA auto-tagging, pose generation and portfolio publishing require an active subscription.'}
        </div>
        <div style={{ background:'#F7F6F4', borderRadius:12, padding:'14px 18px', marginBottom:24, textAlign:'left' }}>
          <div style={{ fontSize:12, fontWeight:600, color:'#111', marginBottom:8 }}>What you unlock with LIA Pro</div>
          {['LIA auto-tags every garment instantly','Generate 4 AI model poses per garment','Publish your portfolio website','Accept orders & enquiries from customers'].map(f=>(
            <div key={f} style={{ fontSize:12, color:'#555', display:'flex', alignItems:'center', gap:7, marginBottom:5 }}>
              <span style={{ color:'#F4622A', fontWeight:600 }}>✓</span> {f}
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', fontSize:13, fontWeight:500, background:'#F7F6F4', border:'none', borderRadius:10, cursor:'pointer', fontFamily:'inherit', color:'#555' }}>Maybe later</button>
          <button onClick={onUpgrade} style={{ flex:2, padding:'12px', fontSize:13, fontWeight:600, background:'#F4622A', border:'none', borderRadius:10, color:'#fff', cursor:'pointer', fontFamily:'inherit', boxShadow:'0 4px 16px rgba(244,98,42,.25)' }}>
            See plans & upgrade →
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Learner Pose Section ──────────────────────────────────────
const LEARNER_POSE_LABELS = [
  { key:'front',   label:'Front',     icon:'👗' },
  { key:'back',    label:'Back',      icon:'🔄' },
  { key:'left',    label:'3/4 Left',  icon:'↖'  },
  { key:'right',   label:'3/4 Right', icon:'↗'  },
  { key:'walking', label:'Walking',   icon:'🚶' },
  { key:'sitting', label:'Sitting',   icon:'🪑' },
  { key:'closeup', label:'Close-up',  icon:'🔍' },
  { key:'outdoor', label:'Outdoor',   icon:'🌿' },
]

function LearnerPoseSection({ garment, hasAccess, onUpdate, onUpgrade, toast }) {
  const [selPoses,     setSelPoses]    = useState(['front','back','walking','sitting'])
  const [poseTab,      setPoseTab]     = useState('generate')
  const [submitting,   setSubmitting]  = useState(false)
  const [tryonImg,     setTryonImg]    = useState(null)
  const [tryonResult,  setTryonResult] = useState(null)
  const [tryonLoading, setTryonLoading]= useState(false)
  const tryonRef  = useRef()
  const pollRef   = useRef(null)
  const pollCount = useRef(0)

  const poses        = garment.poses        || {}
  const pendingPoses = garment.pending_poses || {}
  const hasPending   = Object.keys(pendingPoses).length > 0

  useEffect(() => {
    if (Object.keys(pendingPoses).length > 0) { pollCount.current = 0; startPolling() }
    return () => clearInterval(pollRef.current)
  }, [garment.id])

  function startPolling() {
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      pollCount.current++
      if (pollCount.current > 60) { clearInterval(pollRef.current); return }
      const { data: fresh } = await supabase.from('garments').select('poses,pending_poses').eq('id', garment.id).single()
      const pending = fresh?.pending_poses || {}
      if (!Object.keys(pending).length) { clearInterval(pollRef.current); return }
      try {
        const res = await fetch('/api/check-poses', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prediction_ids: pending }) })
        const data = await res.json()
        if (Object.keys(data.results||{}).length > 0) await onUpdate(garment.id, { poses: { ...(fresh?.poses||{}), ...data.results } })
        if (!Object.keys(data.still_pending||{}).length) { clearInterval(pollRef.current); await onUpdate(garment.id, { pending_poses: {} }); toast('Poses ready ✓', 'success') }
        else await onUpdate(garment.id, { pending_poses: data.still_pending })
      } catch(e) { console.error('Poll:', e) }
    }, 6000)
  }

  async function handleGenerate(poseKey) {
    if (!hasAccess) { onUpgrade(); return }
    const keys = poseKey ? [poseKey] : selPoses
    if (!keys.length) { toast('Select at least one pose', 'error'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/submit-poses', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ garment_image_url: garment.image_url, gender: garment.gender||'female', pose_keys: keys }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await onUpdate(garment.id, { pending_poses: { ...pendingPoses, ...data.prediction_ids } })
      pollCount.current = 0; startPolling()
      toast(`Generating ${keys.length} pose${keys.length!==1?'s':''} — safe to switch screens ✓`, 'default')
    } catch(err) { toast(err.message||'Failed', 'error') }
    setSubmitting(false)
  }

  async function handleTryon() {
    if (!hasAccess) { onUpgrade(); return }
    if (!tryonImg) { toast('Upload a photo first', 'error'); return }
    setTryonLoading(true)
    try {
      const base64 = tryonImg.split(',')[1]
      const res = await fetch('/api/try-on', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model_image_base64: base64, garment_image_url: garment.image_url }) })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setTryonResult(data.result_url)
      toast('Try-on complete ✓', 'success')
    } catch(err) { toast(err.message||'Failed', 'error') }
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
            <div style={{ fontSize:13, fontWeight:600 }}>LIA model poses</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>
              {hasAccess ? `${(garment.gender||'female')==='male'?'Male':'Female'} model · tap to select, then generate` : 'Subscribe to generate model photos'}
            </div>
            {hasPending && <div style={{ fontSize:11, color:'#F4622A', marginTop:4, display:'flex', alignItems:'center', gap:5 }}><Spinner size={11} color="#F4622A"/> Generating — safe to switch screens</div>}
          </div>
          {hasAccess ? (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              <button onClick={()=>setSelPoses(LEARNER_POSE_LABELS.map(p=>p.key))} style={{ fontSize:11, padding:'5px 10px', borderRadius:6, border:'1px solid #E2E0DC', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>All 8</button>
              <button onClick={()=>setSelPoses([])} style={{ fontSize:11, padding:'5px 10px', borderRadius:6, border:'1px solid #E2E0DC', background:'#fff', cursor:'pointer', fontFamily:'inherit' }}>None</button>
              <button onClick={()=>handleGenerate(null)} disabled={submitting||!selPoses.length}
                style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'7px 14px', fontSize:12, fontWeight:600, borderRadius:8, border:'none', background:selPoses.length?'#F4622A':'#ccc', color:'#fff', cursor:selPoses.length?'pointer':'not-allowed', fontFamily:'inherit' }}>
                {submitting?<><Spinner size={12} color="#fff"/> Submitting…</>:`✦ Generate ${selPoses.length}`}
              </button>
            </div>
          ) : (
            <button onClick={onUpgrade} style={{ fontSize:12, padding:'7px 14px', borderRadius:8, border:'1px solid #F4622A', background:'transparent', color:'#F4622A', cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>🔒 Unlock poses →</button>
          )}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, filter:!hasAccess?'blur(3px)':'none', pointerEvents:!hasAccess?'none':'auto' }}>
          {LEARNER_POSE_LABELS.map(p => {
            const isDone    = !!poses[p.key]
            const isPending = p.key in pendingPoses
            const isSel     = selPoses.includes(p.key)
            return (
              <div key={p.key}
                style={{ borderRadius:10, overflow:'hidden', border:`2px solid ${isDone?'#E8E6E2':isSel?'#F4622A':'#F0EEE9'}`, background:isSel&&!isDone?'#FEF8F6':'#FAFAFA', cursor:isDone||isPending?'default':'pointer' }}
                onClick={()=>{ if(!isDone&&!isPending) setSelPoses(prev => prev.includes(p.key) ? prev.filter(k=>k!==p.key) : [...prev, p.key]) }}>
                {isDone ? (
                  <>
                    <img src={poses[p.key]} alt={p.label} style={{ width:'100%', aspectRatio:'3/4', objectFit:'cover', display:'block' }}/>
                    <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'5px 7px', background:'linear-gradient(to top,rgba(0,0,0,.65),transparent)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:10, color:'#fff', fontWeight:500 }}>{p.label}</span>
                      <button onClick={e=>{e.stopPropagation();handleGenerate(p.key)}} style={{ fontSize:9, padding:'2px 7px', background:'rgba(255,255,255,.25)', border:'none', borderRadius:4, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>Redo</button>
                    </div>
                  </>
                ) : (
                  <div style={{ aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:5, padding:6, position:'relative' }}>
                    {isPending ? <><Spinner size={18} color="#F4622A"/><div style={{ fontSize:9, color:'#aaa', textAlign:'center', lineHeight:1.4 }}>Generating…</div></>
                      : <>
                          <div style={{ fontSize:20, opacity:.3 }}>{p.icon}</div>
                          <div style={{ fontSize:9, color:'#bbb' }}>{p.label}</div>
                          <div style={{ fontSize:9, fontWeight:600, color:isSel?'#F4622A':'#ccc' }}>{isSel?'✓ Selected':'tap to select'}</div>
                        </>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>}

      {poseTab==='tryon' && (
        <div>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Virtual try-on</div>
          <div style={{ fontSize:12, color:'#888', lineHeight:1.6, marginBottom:10 }}>Upload your photo — LIA places this garment on you.</div>
          <div style={{ background:'#FEF0EA', border:'1px solid #F4622A44', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#C94E1E', fontWeight:500 }}>
            ⚠ Must be a full body photo (head to toe) for the complete garment to show
          </div>
          <div style={{ fontSize:12, color:'#666', background:'#F7F6F4', borderRadius:8, padding:'8px 12px', marginBottom:12, lineHeight:1.7 }}>
            ✓ Full body head-to-toe &nbsp; ✓ Plain background &nbsp; ✓ Facing forward &nbsp; ✓ Good lighting
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12, filter:!hasAccess?'blur(3px)':'none', pointerEvents:!hasAccess?'none':'auto' }}>
            <div>
              <div style={{ fontSize:11, color:'#aaa', marginBottom:5 }}>Your photo</div>
              <div onClick={()=>hasAccess&&tryonRef.current?.click()}
                style={{ border:`2px dashed ${tryonImg?'#F4622A':'#E2E0DC'}`, borderRadius:10, aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, cursor:hasAccess?'pointer':'default', overflow:'hidden', background:'#FAFAFA' }}>
                {tryonImg ? <img src={tryonImg} alt="you" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <><div style={{ fontSize:24, opacity:.25 }}>👤</div><div style={{ fontSize:11, color:'#bbb' }}>Click to upload</div></>}
              </div>
              <input ref={tryonRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{if(e.target.files[0]){const r=new FileReader();r.onload=ev=>setTryonImg(ev.target.result);r.readAsDataURL(e.target.files[0])};e.target.value=''}}/>
              {tryonImg && <button onClick={()=>{setTryonImg(null);setTryonResult(null)}} style={{ marginTop:5, fontSize:11, color:'#aaa', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit' }}>Remove</button>}
            </div>
            <div>
              <div style={{ fontSize:11, color:'#aaa', marginBottom:5 }}>Try-on result</div>
              <div style={{ border:'1px solid #E2E0DC', borderRadius:10, aspectRatio:'3/4', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6, overflow:'hidden', background:'#FAFAFA' }}>
                {tryonResult ? <img src={tryonResult} alt="result" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : tryonLoading ? <><Spinner size={22} color="#F4622A"/><div style={{ fontSize:11, color:'#aaa', textAlign:'center', lineHeight:1.5 }}>Generating…<br/>30–120s</div></>
                  : <><div style={{ fontSize:22, opacity:.15 }}>✦</div><div style={{ fontSize:11, color:'#ccc' }}>Result here</div></>}
              </div>
            </div>
          </div>
          {!hasAccess ? (
            <button onClick={onUpgrade} style={{ width:'100%', padding:'11px', fontSize:13, fontWeight:600, background:'#F4622A', border:'none', borderRadius:10, color:'#fff', cursor:'pointer', fontFamily:'inherit' }}>🔒 Subscribe to use try-on →</button>
          ) : (
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={handleTryon} disabled={!tryonImg||tryonLoading}
                style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, padding:'10px', fontSize:13, fontWeight:600, borderRadius:10, border:'none', background:tryonImg&&!tryonLoading?'#F4622A':'#ccc', color:'#fff', cursor:tryonImg&&!tryonLoading?'pointer':'not-allowed', fontFamily:'inherit' }}>
                {tryonLoading?<><Spinner size={14} color="#fff"/> Generating…</>:'✦ Try it on me'}
              </button>
              {tryonResult && <a href={tryonResult} download="tryon.png" style={{ padding:'10px 16px', fontSize:12, fontWeight:500, borderRadius:10, border:'1px solid #E2E0DC', background:'#fff', color:'#333', textDecoration:'none', display:'inline-flex', alignItems:'center' }}>↓ Save</a>}
            </div>
          )}
        </div>
      )}
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
        <div style={{ fontSize:12, color:'#888', padding:'8px 12px', background:'#F7F6F4', borderRadius:9 }}>✦ LIA will auto-generate a description</div>
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button type="button" style={{ ...s, background:'#fff', borderColor:'#E2E0DC', color:'#333' }} onClick={onClose}>Cancel</button>
          <button type="submit" style={{ ...s, background:'#F4622A', borderColor:'#F4622A', color:'#fff' }} disabled={loading}>{loading?<Spinner size={13} color="#fff"/>:'Create'}</button>
        </div>
      </form>
    </Modal>
  )
}
