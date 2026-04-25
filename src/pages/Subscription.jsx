import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getPlans, getActiveSubscription, getUsage, currentMonth } from '../lib/subscription'
import { Spinner } from '../components/ui'

const G = '#F4622A'

function btn(v='default', extra={}) {
  const base = { display:'inline-flex', alignItems:'center', gap:6, padding:'10px 20px', fontSize:13, fontWeight:600, borderRadius:10, border:'1px solid', cursor:'pointer', fontFamily:'inherit', transition:'all .15s', justifyContent:'center', ...extra }
  if (v==='primary') return { ...base, background:G, borderColor:G, color:'#fff', boxShadow:`0 4px 16px rgba(244,98,42,.25)` }
  if (v==='outline') return { ...base, background:'transparent', borderColor:G, color:G }
  return { ...base, background:'#fff', borderColor:'#E2E0DC', color:'#555' }
}

const PLAN_META = {
  monthly:  { icon:'⚡', highlight: false, badge: null },
  '6month': { icon:'🔥', highlight: true,  badge: 'Most popular' },
  '12month':{ icon:'💎', highlight: false,  badge: 'Best value' },
  topup:    { icon:'➕', highlight: false,  badge: 'Top-up' },
}

export default function SubscriptionPage({ learner, onSubscribed }) {
  const [plans,     setPlans]     = useState([])
  const [activeSub, setActiveSub] = useState(null)
  const [usage,     setUsage]     = useState({ garments_used:0, poses_used:0 })
  const [selPlan,   setSelPlan]   = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [paying,    setPaying]    = useState(false)
  const [showTopup, setShowTopup] = useState(false)

  useEffect(() => {
    load()
    if (!window.Razorpay) {
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      document.body.appendChild(s)
    }
  }, [])

  async function load() {
    setLoading(true)
    const [p, s, u] = await Promise.all([
      getPlans(), getActiveSubscription(learner.id), getUsage(learner.id),
    ])
    setPlans(p.filter(pl => !['free'].includes(pl.slug)))
    setActiveSub(s)
    setUsage(u)
    setLoading(false)
  }

  async function handlePay(plan, isTopup = false) {
    if (!plan || paying) return
    setPaying(true)
    try {
      const res = await fetch('/api/create-order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_inr: plan.price_inr, learner_id: learner.id, plan_slug: plan.slug, plan_name: plan.name }),
      })
      const { order_id, amount, currency, key_id, error } = await res.json()
      if (error) throw new Error(error)

      const options = {
        key: key_id, amount, currency,
        name: 'Skillinabox Portfolio',
        description: isTopup ? `Top-up: +${plan.garment_limit} garments & +${plan.pose_limit} AI images` : `${plan.name} — LIA Portfolio Plan`,
        order_id,
        prefill: { name: learner.name, email: learner.email, contact: learner.phone || '' },
        theme: { color: G },
        handler: async (response) => {
          const vRes = await fetch('/api/verify-payment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              learner_id:          learner.id,
              plan_id:             plan.id,
              amount_paid:         amount,
              duration_months:     plan.duration_months,
              free_months:         plan.free_months || 0,
              is_topup:            isTopup,
            }),
          })
          const vData = await vRes.json()
          if (vData.success) {
            await load()
            if (onSubscribed) onSubscribed()
            setShowTopup(false)
            setSelPlan(null)
          } else {
            alert('Payment verification failed. Please contact support.')
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      }
      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      alert(err.message || 'Payment failed. Please try again.')
    }
    setPaying(false)
  }

  const isExpired = learner.subscription_status === 'expired'
  const isActive  = ['active','trial'].includes(learner.subscription_status) && activeSub
  const daysLeft  = activeSub ? Math.max(0, Math.ceil((new Date(activeSub.end_date) - new Date()) / 86400000)) : 0
  const activePlan = activeSub?.subscription_plans
  const topupPlan  = plans.find(p => p.slug === 'topup')
  const mainPlans  = plans.filter(p => p.slug !== 'topup')

  // Usage percentages
  const gPct = activePlan ? Math.min(100, Math.round((usage.garments_used / activePlan.garment_limit) * 100)) : 0
  const pPct = activePlan ? Math.min(100, Math.round((usage.poses_used    / activePlan.pose_limit)    * 100)) : 0
  const isLow = gPct >= 80 || pPct >= 80
  const isMaxed = gPct >= 100 || pPct >= 100

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Spinner color={G}/></div>

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>

      {/* Active status card */}
      {isActive && (
        <div style={{ background:'#fff', border:'1px solid #E8E6E2', borderRadius:14, padding:'20px', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:16, flexWrap:'wrap', marginBottom:16 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#0D6B3A' }}/>
                <span style={{ fontSize:14, fontWeight:600, color:'#111' }}>
                  {activeSub.status==='trial' ? '🎁 Free Trial' : activePlan?.name}
                </span>
              </div>
              <div style={{ fontSize:13, color:'#888' }}>
                {daysLeft} day{daysLeft!==1?'s':''} left · expires {new Date(activeSub.end_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
              </div>
            </div>
            {(isLow || isMaxed) && topupPlan && (
              <button style={btn('primary', { padding:'8px 16px', fontSize:12 })} onClick={()=>setShowTopup(true)}>
                {isMaxed ? '⚠ Maxed out — Buy top-up' : '➕ Buy top-up pack'}
              </button>
            )}
          </div>

          {/* Usage meters */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <UsageMeter
              label="Garment uploads"
              used={usage.garments_used}
              limit={activePlan?.garment_limit}
              sublabel="with LIA auto-tagging"
              color="#5B21B6"/>
            <UsageMeter
              label="AI images used"
              used={usage.poses_used}
              limit={activePlan?.pose_limit}
              sublabel="model poses + try-ons"
              color={G}/>
          </div>

          {isMaxed && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'#FEF0EA', borderRadius:8, fontSize:13, color:'#C94E1E', fontWeight:500 }}>
              ⚠ You've used your full allocation for this month.
              {topupPlan && ' Buy a top-up pack to continue generating poses.'}
            </div>
          )}
          {!isMaxed && daysLeft <= 7 && (
            <div style={{ marginTop:12, padding:'10px 14px', background:'#FEF3E2', borderRadius:8, fontSize:13, color:'#92400E', fontWeight:500 }}>
              ⏳ Your plan expires in {daysLeft} day{daysLeft!==1?'s':''}. Renew below to keep access.
            </div>
          )}
        </div>
      )}

      {/* Expired banner */}
      {isExpired && (
        <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:12, padding:'16px 20px', marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#991B1B', marginBottom:4 }}>Your subscription has expired</div>
          <div style={{ fontSize:13, color:'#B91C1C' }}>LIA features and portfolio publishing are paused. Resubscribe below to reactivate.</div>
        </div>
      )}

      {/* Top-up modal */}
      {showTopup && topupPlan && (
        <div style={{ background:'#F0EFFE', border:'1px solid #DDD6FE', borderRadius:14, padding:'20px', marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#5B21B6', marginBottom:8 }}>➕ Top-up Pack — ₹{topupPlan.price_inr}</div>
          <div style={{ fontSize:13, color:'#7C3AED', lineHeight:1.7, marginBottom:14 }}>
            Adds <strong>+{topupPlan.garment_limit} garments</strong> and <strong>+{topupPlan.pose_limit} AI images</strong> to your current month.
            Valid until your plan expires on {activeSub ? new Date(activeSub.end_date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}) : '—'}.
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button style={btn('primary')} onClick={()=>handlePay(topupPlan, true)} disabled={paying}>
              {paying ? <><Spinner size={14} color="#fff"/> Processing…</> : `Pay ₹${topupPlan.price_inr} →`}
            </button>
            <button style={btn()} onClick={()=>setShowTopup(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* What's included explainer */}
      <div style={{ background:'#F7F6F4', borderRadius:12, padding:'16px 18px', marginBottom:20 }}>
        <div style={{ fontSize:12, fontWeight:600, color:'#555', marginBottom:10 }}>Every plan includes:</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
          {[
            ['🤖', 'LIA auto-tagging', 'Name, fabric, features detected from photo'],
            ['👗', 'AI model poses',   'Professional model photos in 8 styles'],
            ['👤', 'Virtual try-on',  'Customer tries garment on their own photo'],
            ['✦',  'Bio & descriptions', 'LIA writes your portfolio content'],
            ['🎨', 'Portfolio themes', 'Choose from multiple design themes'],
            ['🌐', 'Published website', 'Share your portfolio at your own URL'],
          ].map(([icon, title, sub]) => (
            <div key={title} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
              <span style={{ fontSize:14, marginTop:1 }}>{icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:500, color:'#333' }}>{title}</div>
                <div style={{ fontSize:11, color:'#aaa' }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Plans grid */}
      <div style={{ fontSize:11, fontWeight:600, color:'#aaa', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:14 }}>
        {isActive ? 'Renew or upgrade' : 'Choose your plan'}
      </div>

      <div className="plan-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginBottom:20 }}>
        {mainPlans.map(plan => {
          const meta = PLAN_META[plan.slug] || {}
          const isCurrentPlan = activeSub?.plan_id === plan.id && isActive
          const isSel = selPlan?.id === plan.id
          const perMonth = plan.duration_months > 1
            ? Math.round(plan.price_inr / plan.duration_months)
            : plan.price_inr

          return (
            <div key={plan.id} onClick={()=>setSelPlan(isSel ? null : plan)}
              style={{ background:'#fff', border:`${isSel||meta.highlight?'2px':'1px'} solid ${isSel?G:meta.highlight?G+'66':'#E8E6E2'}`, borderRadius:14, padding:'20px 18px', cursor:'pointer', transition:'all .15s', position:'relative', boxShadow: isSel?`0 4px 20px rgba(244,98,42,.15)`:meta.highlight?`0 2px 12px rgba(244,98,42,.08)`:'none' }}>

              {meta.badge && !isCurrentPlan && (
                <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:meta.highlight?G:'#555', color:'#fff', fontSize:10, fontWeight:600, padding:'3px 14px', borderRadius:99, whiteSpace:'nowrap' }}>{meta.badge}</div>
              )}
              {isCurrentPlan && (
                <div style={{ position:'absolute', top:-11, left:'50%', transform:'translateX(-50%)', background:'#0D6B3A', color:'#fff', fontSize:10, fontWeight:600, padding:'3px 14px', borderRadius:99, whiteSpace:'nowrap' }}>✓ Current plan</div>
              )}

              <div style={{ fontSize:20, marginBottom:8 }}>{meta.icon}</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#111', marginBottom:8 }}>{plan.name}</div>

              <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:2 }}>
                <span style={{ fontSize:28, fontWeight:700, color:G }}>₹{Number(plan.price_inr).toLocaleString('en-IN')}</span>
              </div>
              {plan.duration_months > 1 && (
                <div style={{ fontSize:11, color:'#0D6B3A', fontWeight:500, marginBottom:8 }}>
                  ₹{perMonth.toLocaleString('en-IN')}/month · save ₹{(999 * plan.duration_months - plan.price_inr).toLocaleString('en-IN')}
                </div>
              )}
              <div style={{ fontSize:12, color:'#888', marginBottom:14 }}>
                {plan.duration_months + (plan.free_months||0)} month{plan.duration_months+(plan.free_months||0)!==1?'s':''} access
                {plan.free_months>0 && <span style={{ color:'#0D6B3A', fontWeight:500 }}> · {plan.free_months} month free!</span>}
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#333' }}>
                  <span style={{ color:'#0D6B3A', fontWeight:700 }}>✓</span>
                  <span><strong>{plan.garment_limit}</strong> garment uploads</span>
                  {plan.duration_months > 1 && <span style={{ fontSize:10, color:'#aaa' }}>per month</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#333' }}>
                  <span style={{ color:'#0D6B3A', fontWeight:700 }}>✓</span>
                  <span><strong>{plan.pose_limit}</strong> AI images</span>
                  {plan.duration_months > 1 && <span style={{ fontSize:10, color:'#aaa' }}>per month</span>}
                </div>
                <div style={{ fontSize:11, color:'#aaa', marginTop:2, lineHeight:1.5 }}>
                  AI images = model poses + virtual try-ons combined
                </div>
              </div>

              {isSel && (
                <button style={{ ...btn('primary'), width:'100%', marginTop:14 }} onClick={e=>{e.stopPropagation();handlePay(plan)}} disabled={paying}>
                  {paying ? <><Spinner size={14} color="#fff"/> Processing…</> : `Pay ₹${Number(plan.price_inr).toLocaleString('en-IN')} →`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Top-up CTA if active */}
      {isActive && topupPlan && !showTopup && (
        <div style={{ border:'1px dashed #E2E0DC', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'#333' }}>Need more this month?</div>
            <div style={{ fontSize:12, color:'#888', marginTop:2 }}>Top-up pack: +6 garments & +20 AI images for ₹{topupPlan.price_inr}</div>
          </div>
          <button style={btn('outline', { padding:'8px 16px', fontSize:12 })} onClick={()=>setShowTopup(true)}>➕ Buy top-up</button>
        </div>
      )}

      <div style={{ marginTop:20, fontSize:12, color:'#bbb', textAlign:'center', lineHeight:1.8 }}>
        Secure payments by Razorpay · No hidden charges<br/>
        AI images = model pose generation + virtual try-ons combined · Monthly limits reset on your renewal date
      </div>
    </div>
  )
}

function UsageMeter({ label, used, limit, sublabel, color }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const isHigh = pct >= 80
  const isMaxed = pct >= 100
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <div>
          <div style={{ fontSize:12, fontWeight:500, color:'#333' }}>{label}</div>
          <div style={{ fontSize:10, color:'#aaa' }}>{sublabel}</div>
        </div>
        <div style={{ fontSize:13, fontWeight:700, color: isMaxed?'#C94E1E':isHigh?'#92400E':color }}>
          {used}<span style={{ fontSize:11, fontWeight:400, color:'#aaa' }}>/{limit}</span>
        </div>
      </div>
      <div style={{ height:7, background:'#F0EEE9', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: isMaxed?'#C94E1E':isHigh?'#F59E0B':color, borderRadius:99, transition:'width .4s' }}/>
      </div>
      <div style={{ fontSize:10, color: isMaxed?'#C94E1E':isHigh?'#92400E':'#bbb', marginTop:3 }}>
        {isMaxed ? 'Limit reached — buy a top-up' : isHigh ? `${limit-used} remaining` : `${limit-used} remaining`}
      </div>
    </div>
  )
}
