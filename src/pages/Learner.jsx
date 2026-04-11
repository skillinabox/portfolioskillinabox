import { useState, useEffect, useRef } from 'react'
import { supabase, uploadGarmentImage, tagGarment, fileToBase64 } from '../lib/supabase'
import { useAuth } from '../App'
import { SIBLogo, Avatar, StatusBadge, GarmentThumb, Empty, Spinner, useToast } from '../components/ui'

export default function Learner() {
  const { learner: authLearner, signOut } = useAuth()
  const toast = useToast()
  const [learner, setLearner]     = useState(authLearner)
  const [garments, setGarments]   = useState([])
  const [enquiries, setEnquiries] = useState([])
  const [selGid, setSelGid]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [tab, setTab]             = useState('garments')
  const fileRef = useRef()

  const garment = garments.find(g=>g.id===selGid)
  const unread  = enquiries.filter(e=>!e.read).length

  useEffect(() => {
    if (authLearner?.id) { loadAll(authLearner.id); setLearner(authLearner) }
    else setLoading(false)
  }, [authLearner])

  async function loadAll(lid) {
    setLoading(true)
    const [{ data:g },{ data:e }] = await Promise.all([
      supabase.from('garments').select('*').eq('learner_id', lid).order('created_at'),
      supabase.from('enquiries').select('*').eq('learner_id', lid).order('created_at',{ascending:false}),
    ])
    setGarments(g||[])
    setEnquiries(e||[])
    if (g?.length) setSelGid(g[0].id)
    setLoading(false)
  }

  async function handleUpload(file) {
    if (!file||!learner) return
    const { data:g, error } = await supabase.from('garments').insert({ learner_id:learner.id, status:'uploading', name:file.name.replace(/\.[^.]+$/,'') }).select().single()
    if (error) { toast('Upload failed','error'); return }
    setGarments(p=>[...p,g]); setSelGid(g.id)
    try {
      const imageUrl = await uploadGarmentImage(learner.id, g.id, file)
      setGarments(p=>p.map(x=>x.id===g.id?{...x,image_url:imageUrl,status:'tagging'}:x))
      await supabase.from('garments').update({ image_url:imageUrl, status:'tagging' }).eq('id', g.id)
      const base64 = await fileToBase64(file)
      const tags = await tagGarment(base64, file.type)
      const updates = { ...tags, name:tags.name||file.name.replace(/\.[^.]+$/,''), status:'tagged', ai_tagged:true }
      await supabase.from('garments').update(updates).eq('id', g.id)
      setGarments(p=>p.map(x=>x.id===g.id?{...x,...updates}:x))
      toast('Garment added!','success')
    } catch {
      await supabase.from('garments').update({ status:'tagged' }).eq('id', g.id)
      setGarments(p=>p.map(x=>x.id===g.id?{...x,status:'tagged'}:x))
      toast('Uploaded — fill details manually')
    }
  }

  async function saveGarment(gid) {
    setGarments(p=>p.map(g=>g.id===gid?{...g,...editForm}:g))
    await supabase.from('garments').update(editForm).eq('id', gid)
    setEditingId(null)
    toast('Saved','success')
  }

  async function markRead(eid) {
    await supabase.from('enquiries').update({ read:true }).eq('id', eid)
    setEnquiries(p=>p.map(e=>e.id===eid?{...e,read:true}:e))
  }

  const visible = garments.filter(g=>['tagged','ready','published'].includes(g.status)||g.poses_ready)

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--dark)', flexDirection:'column', gap:16 }}>
      <SIBLogo dark={true}/>
      <Spinner size={24} color="#F4622A"/>
    </div>
  )

  if (!learner) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:12, background:'var(--dark)', textAlign:'center', padding:24 }}>
      <SIBLogo dark={true}/>
      <div style={{ marginTop:20, fontSize:15, fontWeight:600, color:'#fff' }}>Account not linked</div>
      <p style={{ fontSize:13, color:'#666', maxWidth:320, lineHeight:1.5 }}>Your email isn't linked to a learner profile. Contact your Skillinabox coordinator.</p>
      <button className="btn btn-default" onClick={signOut}>Sign out</button>
    </div>
  )

  const slug = (learner.brand||learner.name).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

  return (
    <div className="layout">
      <header className="topbar">
        <SIBLogo dark={true}/>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {learner.status==='published'&&learner.slug && (
            <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background:'var(--orange-light)', borderColor:'var(--orange)', color:'var(--orange-dark)', fontWeight:500, border:'1px solid' }}>↗ View my portfolio</a>
          )}
          <button className="btn btn-ghost btn-sm" style={{ color:'#888' }} onClick={signOut}>Sign out</button>
        </div>
      </header>

      <aside className="sidebar">
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #2E2E2E', display:'flex', gap:10, alignItems:'center' }}>
          <Avatar name={learner.name} size={38}/>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>{learner.name}</div>
            <div style={{ fontSize:12, color:'#666' }}>{learner.brand||'No brand set'}</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', borderBottom:'1px solid #2E2E2E' }}>
          {[[visible.length,'Garments'],[enquiries.length,'Enquiries'],[enquiries.filter(e=>e.type==='order').length,'Orders']].map(([v,l])=>(
            <div key={l} style={{ padding:'10px 6px', textAlign:'center', borderRight:'1px solid #2E2E2E' }}>
              <div style={{ fontSize:18, fontWeight:600, color:'var(--orange)' }}>{v}</div>
              <div style={{ fontSize:10, color:'#555', marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>

        {[
          ['garments', 'My garments',      `${visible.length} piece${visible.length!==1?'s':''}`],
          ['enquiries','Enquiries & orders',`${unread} unread`],
          ['website',  'My website',        learner.status==='published'?'Live ✓':'Awaiting publish'],
        ].map(([id,label,sub])=>(
          <div key={id} className={`nav-item ${tab===id?'active':''}`} onClick={()=>setTab(id)} style={{ justifyContent:'space-between' }}>
            <div>
              <div className="nav-label">{label}</div>
              <div className="nav-sub">{sub}</div>
            </div>
            {id==='enquiries'&&unread>0 && <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(244,98,42,.2)', color:'var(--orange)', fontWeight:600 }}>{unread}</span>}
          </div>
        ))}

        <div style={{ margin:12, padding:'10px 12px', background:'#1A1A1A', border:'1px solid #2E2E2E', borderRadius:'var(--r-md)', fontSize:12, color:'#555', lineHeight:1.5 }}>
          To add AI-generated poses, contact your Skillinabox coordinator.
        </div>
      </aside>

      <main className="main">
        <div style={{ maxWidth:760 }}>
          {/* GARMENTS */}
          {tab==='garments' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div className="card">
                <div className="card-head">
                  <div><div className="card-title">My garments</div><div className="card-sub">Set pricing and descriptions</div></div>
                  <button className="btn btn-primary btn-sm" onClick={()=>fileRef.current?.click()}>+ Upload garment</button>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ if(e.target.files[0]) handleUpload(e.target.files[0]); e.target.value='' }}/>
                </div>
                {garments.length===0 ? (
                  <Empty icon="👗" title="No garments yet" message="Upload your first garment photo — AI will auto-tag the fabric, style and features." action={<button className="btn btn-primary" onClick={()=>fileRef.current?.click()}>Upload garment</button>}/>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10, padding:14 }}>
                    {garments.map((g,i)=><GarmentThumb key={g.id} garment={g} index={i} selected={selGid===g.id} onClick={()=>setSelGid(g.id)}/>)}
                  </div>
                )}
              </div>

              {garment && (
                <div className="card anim-in">
                  {garment.status==='tagging'||garment.status==='uploading' ? (
                    <div style={{ padding:'40px 20px', textAlign:'center' }}>
                      <div style={{ fontSize:32, color:'var(--orange)', marginBottom:12 }} className="spin">✦</div>
                      <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>{garment.status==='uploading'?'Uploading…':'Analysing with Claude AI…'}</div>
                    </div>
                  ) : editingId===garment.id ? (
                    <>
                      <div className="card-head">
                        <div className="card-title">Edit details</div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button className="btn btn-default btn-sm" onClick={()=>setEditingId(null)}>Cancel</button>
                          <button className="btn btn-primary btn-sm" onClick={()=>saveGarment(garment.id)}>Save changes</button>
                        </div>
                      </div>
                      <div style={{ padding:16 }}>
                        {[['Garment name','name'],['Price (₹)','price'],['Description','description'],['Availability','availability'],['Sizes','sizes']].map(([l,f])=>(
                          <div key={f} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                            <span style={{ fontSize:12, color:'var(--mid)', width:88, flexShrink:0 }}>{l}</span>
                            <input className="input" style={{ flex:1, fontSize:13, padding:'5px 9px' }}
                              value={editForm[f]??garment[f]??''} onChange={e=>setEditForm(p=>({...p,[f]:e.target.value}))}/>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="card-head">
                        <div>
                          <div className="card-title">{garment.name}</div>
                          <div className="card-sub">{garment.category}{garment.fabric?` · ${garment.fabric}`:''}</div>
                        </div>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <StatusBadge status={garment.status}/>
                          <button className="btn btn-default btn-sm" onClick={()=>{ setEditingId(garment.id); setEditForm({}) }}>Edit</button>
                        </div>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:garment.image_url?'160px 1fr':'1fr' }}>
                        {garment.image_url && <div style={{ padding:14, borderRight:'1px solid var(--border)' }}><img src={garment.image_url} alt="" style={{ width:'100%', borderRadius:8, objectFit:'cover', aspectRatio:'3/4', display:'block' }}/></div>}
                        <div style={{ padding:16 }}>
                          {[['Price', garment.price?`₹${Number(garment.price).toLocaleString('en-IN')}`:'Not set'],['Availability',garment.availability],['Sizes',garment.sizes],['Occasion',garment.occasion]].map(([l,v])=>v?(
                            <div key={l} style={{ marginBottom:10 }}>
                              <div style={{ fontSize:11, color:'var(--mid)' }}>{l}</div>
                              <div style={{ fontSize:13, fontWeight:l==='Price'?600:400, color:l==='Price'&&garment.price?'var(--orange-dark)':'var(--dark)' }}>{v}</div>
                            </div>
                          ):null)}
                          {garment.description && <div style={{ fontSize:13, color:'var(--dark-3)', lineHeight:1.5 }}>{garment.description}</div>}
                          {!garment.price && <div style={{ fontSize:12, color:'var(--amber-fg)', background:'var(--amber-bg)', padding:'6px 12px', borderRadius:'var(--r-sm)', display:'inline-block', marginTop:8 }}>Set a price to show this on your portfolio</div>}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ENQUIRIES */}
          {tab==='enquiries' && (
            <div className="card">
              <div className="card-head"><div className="card-title">Enquiries & orders</div><span style={{ fontSize:12, color:'var(--mid)' }}>{enquiries.length} total · {unread} unread</span></div>
              {enquiries.length===0 ? (
                <Empty icon="✉" title="No enquiries yet" message="Share your portfolio link to start receiving enquiries and orders."/>
              ) : enquiries.map(e=>(
                <div key={e.id} onClick={()=>markRead(e.id)} style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', gap:12, background:e.read?'transparent':'rgba(244,98,42,.03)', cursor:e.read?'default':'pointer', transition:'background .2s' }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:e.read?'transparent':'var(--orange)', marginTop:6, flexShrink:0 }}/>
                  <Avatar name={e.from_name} size={34}/>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                      <span style={{ fontSize:14, fontWeight:600 }}>{e.from_name}</span>
                      <StatusBadge status={e.type}/>
                    </div>
                    {e.garment_name && <div style={{ fontSize:12, color:'var(--mid)', marginBottom:4 }}>{e.garment_name}{e.size?` · Size ${e.size}`:''}</div>}
                    <div style={{ fontSize:13, color:'var(--dark-3)', lineHeight:1.5, marginBottom:10 }}>{e.message}</div>
                    <div style={{ display:'flex', gap:8 }}>
                      {e.from_phone && <a href={`https://wa.me/${e.from_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background:'#E6F4EC', borderColor:'#52B27A', color:'var(--green-fg)', border:'1px solid' }}>Reply on WhatsApp</a>}
                      {e.from_email && <a href={`mailto:${e.from_email}`} className="btn btn-sm" style={{ background:'var(--purple-bg)', borderColor:'#9B87F5', color:'var(--purple-fg)', border:'1px solid' }}>Reply by email</a>}
                    </div>
                  </div>
                  <span style={{ fontSize:11, color:'var(--mid)', whiteSpace:'nowrap' }}>{new Date(e.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                </div>
              ))}
            </div>
          )}

          {/* WEBSITE */}
          {tab==='website' && (
            <div className="card">
              <div className="card-head">
                <div><div className="card-title">My portfolio website</div><div className="card-sub">{learner.status==='published'?'Live and shareable':'Awaiting publish from your coordinator'}</div></div>
                {learner.status==='published'&&learner.slug && <a href={`/portfolio/${learner.slug}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background:'#E6F4EC', borderColor:'#52B27A', color:'var(--green-fg)', border:'1px solid' }}>View portfolio ↗</a>}
              </div>
              {learner.status==='published'&&learner.slug ? (
                <div style={{ padding:18 }}>
                  <div style={{ background:'var(--bg)', borderRadius:'var(--r-md)', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18 }}>
                    <div>
                      <div style={{ fontSize:11, color:'var(--mid)', marginBottom:3 }}>Your portfolio URL</div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#1D4ED8' }}>{window.location.origin}/portfolio/{learner.slug}</div>
                    </div>
                    <button className="btn btn-default btn-sm" onClick={()=>{ navigator.clipboard.writeText(`${window.location.origin}/portfolio/${learner.slug}`); toast('Link copied!','success') }}>Copy</button>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`Check out my fashion portfolio: ${window.location.origin}/portfolio/${learner.slug}`)}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background:'#E6F4EC', borderColor:'#52B27A', color:'var(--green-fg)', border:'1px solid' }}>Share on WhatsApp</a>
                  </div>
                  <div style={{ marginTop:20, paddingTop:20, borderTop:'1px solid var(--border)' }}>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--dark)', marginBottom:12 }}>Published garments</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                      {visible.filter(g=>g.status==='published').map((g,i)=><GarmentThumb key={g.id} garment={g} index={i}/>)}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding:'48px 24px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>🎨</div>
                  <div style={{ fontSize:15, fontWeight:600, marginBottom:6 }}>Your portfolio isn't live yet</div>
                  <p style={{ fontSize:13, color:'var(--mid)', lineHeight:1.6, maxWidth:320, margin:'0 auto' }}>Once your garments are reviewed, your Skillinabox coordinator will publish your portfolio.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
