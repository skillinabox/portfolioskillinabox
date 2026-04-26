import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Spinner } from '../components/ui'

const G = '#F4622A'

function fmt(n) { return Number(n||0).toLocaleString('en-IN') }
function pct(a,b) { return b ? Math.round((a/b)*100) : 0 }

export default function Analytics({ onClose }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [range,   setRange]   = useState('30') // days

  useEffect(() => { load() }, [range])

  async function load() {
    setLoading(true)
    const since = new Date(Date.now() - Number(range)*24*60*60*1000).toISOString()

    const [
      { data: learners },
      { data: garments },
      { data: enquiries },
      { data: subscriptions },
      { data: payments },
    ] = await Promise.all([
      supabase.from('learners').select('id,name,brand,status,subscription_status,created_at,location'),
      supabase.from('garments').select('id,learner_id,status,ai_tagged,poses,created_at'),
      supabase.from('enquiries').select('id,learner_id,type,created_at,read'),
      supabase.from('subscriptions').select('id,learner_id,status,amount_paid,created_at,plan_id').eq('status','active'),
      supabase.from('subscriptions').select('id,amount_paid,created_at,status').gte('created_at', since),
    ])

    // Learner stats
    const totalLearners   = learners?.length || 0
    const published       = learners?.filter(l=>l.status==='published').length || 0
    const activeSubbers   = learners?.filter(l=>['active','trial'].includes(l.subscription_status)).length || 0
    const newThisPeriod   = learners?.filter(l=>l.created_at >= since).length || 0

    // Garment stats
    const totalGarments   = garments?.length || 0
    const taggedGarments  = garments?.filter(g=>g.ai_tagged).length || 0
    const withPoses       = garments?.filter(g=>g.poses&&Object.values(g.poses).some(Boolean)).length || 0
    const newGarments     = garments?.filter(g=>g.created_at >= since).length || 0

    // Revenue
    const totalRevenue    = payments?.reduce((s,p)=>s+(p.amount_paid||0),0) || 0
    const activeRevenue   = subscriptions?.reduce((s,p)=>s+(p.amount_paid||0),0) || 0
    const paymentCount    = payments?.filter(p=>p.amount_paid>0).length || 0

    // Enquiries
    const totalEnq        = enquiries?.length || 0
    const newEnq          = enquiries?.filter(e=>e.created_at >= since).length || 0
    const unread          = enquiries?.filter(e=>!e.read).length || 0
    const orders          = enquiries?.filter(e=>e.type==='order').length || 0

    // Top learners by garments
    const garmentsByLearner = {}
    garments?.forEach(g => { garmentsByLearner[g.learner_id] = (garmentsByLearner[g.learner_id]||0)+1 })
    const topLearners = Object.entries(garmentsByLearner)
      .sort((a,b)=>b[1]-a[1]).slice(0,5)
      .map(([id,count]) => ({ ...learners?.find(l=>l.id===id), count }))

    // Locations
    const byLocation = {}
    learners?.forEach(l => { if(l.location) { byLocation[l.location] = (byLocation[l.location]||0)+1 } })
    const topLocations = Object.entries(byLocation).sort((a,b)=>b[1]-a[1]).slice(0,6)

    // Daily new learners (last 7 days)
    const dailyNew = []
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i)
      const ds = d.toISOString().slice(0,10)
      dailyNew.push({
        day: d.toLocaleDateString('en-IN',{weekday:'short'}),
        learners: learners?.filter(l=>l.created_at?.startsWith(ds)).length||0,
        garments: garments?.filter(g=>g.created_at?.startsWith(ds)).length||0,
        enquiries: enquiries?.filter(e=>e.created_at?.startsWith(ds)).length||0,
      })
    }

    setData({ totalLearners, published, activeSubbers, newThisPeriod, totalGarments, taggedGarments, withPoses, newGarments, totalRevenue, activeRevenue, paymentCount, totalEnq, newEnq, unread, orders, topLearners, topLocations, dailyNew })
    setLoading(false)
  }

  async function downloadCSV() {
    const { data: learners } = await supabase.from('learners').select('name,brand,email,phone,location,status,subscription_status,created_at')
    const { data: garments } = await supabase.from('garments').select('name,category,status,ai_tagged,created_at,learner_id')
    const { data: enquiries } = await supabase.from('enquiries').select('from_name,from_email,from_phone,type,garment_name,created_at,learner_id')
    const { data: payments } = await supabase.from('subscriptions').select('learner_id,status,amount_paid,created_at')

    const sections = [
      { name: 'Learners', rows: learners },
      { name: 'Garments', rows: garments },
      { name: 'Enquiries', rows: enquiries },
      { name: 'Payments', rows: payments },
    ]

    let csv = ''
    sections.forEach(s => {
      if (!s.rows?.length) return
      csv += `\n=== ${s.name} ===\n`
      csv += Object.keys(s.rows[0]).join(',') + '\n'
      s.rows.forEach(row => { csv += Object.values(row).map(v=>`"${v||''}"`).join(',') + '\n' })
    })

    const blob = new Blob([csv], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skillinabox-report-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const card = (children, style={}) => (
    <div style={{ background:'#fff', border:'1px solid #E8E6E2', borderRadius:12, padding:18, ...style }}>{children}</div>
  )

  const statBox = (label, value, sub, color='#111') => (
    <div style={{ background:'#fff', border:'1px solid #E8E6E2', borderRadius:12, padding:'16px 18px' }}>
      <div style={{ fontSize:11, color:'#aaa', marginBottom:6, textTransform:'uppercase', letterSpacing:'.07em' }}>{label}</div>
      <div style={{ fontSize:28, fontWeight:700, color, lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'#888' }}>{sub}</div>}
    </div>
  )

  const barMax = data ? Math.max(...data.dailyNew.map(d=>Math.max(d.learners,d.garments,d.enquiries)),1) : 1

  return (
    <div style={{ position:'fixed', inset:0, background:'#F7F6F4', zIndex:200, overflowY:'auto', fontFamily:"'DM Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ background:'#111', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:10 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:600, color:'#fff' }}>Analytics & Reports</div>
          <div style={{ fontSize:12, color:'#555', marginTop:2 }}>Skillinabox Portfolio Platform</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <select value={range} onChange={e=>setRange(e.target.value)}
            style={{ fontSize:12, padding:'6px 10px', border:'1px solid #2A2A2A', borderRadius:7, background:'#1A1A1A', color:'#ccc', outline:'none', fontFamily:'inherit', cursor:'pointer' }}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
          <button onClick={downloadCSV}
            style={{ fontSize:12, padding:'7px 16px', background:G, border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontFamily:'inherit', fontWeight:500 }}>
            ↓ Download CSV
          </button>
          <button onClick={onClose}
            style={{ fontSize:12, padding:'7px 14px', background:'#1A1A1A', border:'1px solid #2A2A2A', borderRadius:8, color:'#888', cursor:'pointer', fontFamily:'inherit' }}>
            ✕ Close
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', flexDirection:'column', gap:12 }}>
          <Spinner size={28} color={G}/>
          <div style={{ fontSize:13, color:'#888' }}>Loading analytics…</div>
        </div>
      ) : (
        <div style={{ maxWidth:1100, margin:'0 auto', padding:'24px' }}>

          {/* Revenue strip */}
          <div style={{ background:'#111', borderRadius:14, padding:'20px 24px', marginBottom:20, display:'flex', gap:32, flexWrap:'wrap', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Revenue (last {range}d)</div>
              <div style={{ fontSize:32, fontWeight:700, color:'#fff' }}>₹{fmt(data.totalRevenue)}</div>
              <div style={{ fontSize:12, color:'#666', marginTop:2 }}>{data.paymentCount} payment{data.paymentCount!==1?'s':''}</div>
            </div>
            <div style={{ width:1, height:48, background:'#222' }}/>
            <div>
              <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Active MRR estimate</div>
              <div style={{ fontSize:28, fontWeight:700, color:G }}>₹{fmt(data.activeSubbers*999)}</div>
              <div style={{ fontSize:12, color:'#666', marginTop:2 }}>Based on {data.activeSubbers} active subscribers × ₹999</div>
            </div>
            <div style={{ width:1, height:48, background:'#222' }}/>
            <div>
              <div style={{ fontSize:11, color:'#555', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6 }}>Conversion rate</div>
              <div style={{ fontSize:28, fontWeight:700, color:'#fff' }}>{pct(data.activeSubbers, data.totalLearners)}%</div>
              <div style={{ fontSize:12, color:'#666', marginTop:2 }}>Learners with active subscription</div>
            </div>
          </div>

          {/* Key stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:20 }}>
            {statBox('Total learners',    fmt(data.totalLearners), `+${data.newThisPeriod} this period`)}
            {statBox('Published',         fmt(data.published), `${pct(data.published,data.totalLearners)}% of learners`, '#0D6B3A')}
            {statBox('Active subscribers',fmt(data.activeSubbers), `${pct(data.activeSubbers,data.totalLearners)}% subscribed`, G)}
            {statBox('Total garments',    fmt(data.totalGarments), `+${data.newGarments} this period`)}
            {statBox('LIA tagged',        fmt(data.taggedGarments), `${pct(data.taggedGarments,data.totalGarments)}% of garments`, '#5B21B6')}
            {statBox('With AI poses',     fmt(data.withPoses), `${pct(data.withPoses,data.totalGarments)}% of garments`, '#0891B2')}
            {statBox('Total enquiries',   fmt(data.totalEnq), `${data.unread} unread`, data.unread>0?'#C94E1E':'#111')}
            {statBox('Orders received',   fmt(data.orders), `${pct(data.orders,data.totalEnq)}% of enquiries`, '#0D6B3A')}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            {/* Activity chart */}
            {card(
              <>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:16 }}>Last 7 days activity</div>
                <div style={{ display:'flex', gap:8, alignItems:'flex-end', height:120 }}>
                  {data.dailyNew.map((d,i) => (
                    <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:2, alignItems:'center' }}>
                        {[
                          [d.garments, '#5B21B6'],
                          [d.learners, G],
                          [d.enquiries, '#0891B2'],
                        ].map(([val,color],j) => (
                          <div key={j} style={{ width:'60%', background:color, borderRadius:3, height: Math.max(3, (val/barMax)*60), opacity:.85, transition:'height .3s' }} title={val}/>
                        ))}
                      </div>
                      <div style={{ fontSize:9, color:'#aaa' }}>{d.day}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', gap:12, marginTop:12 }}>
                  {[['Garments','#5B21B6'],[`New learners`,G],['Enquiries','#0891B2']].map(([l,c])=>(
                    <div key={l} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#888' }}>
                      <div style={{ width:8, height:8, borderRadius:2, background:c }}/>
                      {l}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Top locations */}
            {card(
              <>
                <div style={{ fontSize:13, fontWeight:600, marginBottom:14 }}>Learners by city</div>
                {data.topLocations.length === 0
                  ? <div style={{ fontSize:12, color:'#bbb', fontStyle:'italic' }}>No location data yet</div>
                  : data.topLocations.map(([loc, count]) => (
                    <div key={loc} style={{ marginBottom:10 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                        <span style={{ fontSize:12, color:'#333' }}>📍 {loc}</span>
                        <span style={{ fontSize:12, fontWeight:600, color:'#111' }}>{count}</span>
                      </div>
                      <div style={{ height:5, background:'#F0EEE9', borderRadius:99 }}>
                        <div style={{ height:'100%', width:`${pct(count,data.totalLearners)}%`, background:G, borderRadius:99 }}/>
                      </div>
                    </div>
                  ))}
              </>
            )}
          </div>

          {/* Top learners */}
          {card(
            <>
              <div style={{ fontSize:13, fontWeight:600, marginBottom:14 }}>Most active learners</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10 }}>
                {data.topLearners.map((l,i) => l && (
                  <div key={l.id||i} style={{ padding:'12px 14px', background:'#F7F6F4', borderRadius:10, border:'1px solid #E8E6E2' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background:G, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                        {(l.name||'?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize:12, fontWeight:600 }}>{l.name}</div>
                        <div style={{ fontSize:10, color:'#888' }}>{l.brand||'—'}</div>
                      </div>
                    </div>
                    <div style={{ fontSize:13, color:G, fontWeight:700 }}>{l.count} garments</div>
                    <div style={{ fontSize:10, color:'#888', marginTop:2 }}>
                      {l.status==='published' ? '🌐 Published' : '📝 Draft'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          , { marginBottom:0 })}

        </div>
      )}
    </div>
  )
}
