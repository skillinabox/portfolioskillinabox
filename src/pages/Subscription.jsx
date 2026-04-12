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

export default function SubscriptionPage({ learner, onSubscribed }) {
  const [plans,      setPlans]      = useState([])
  const [activeSub,  setActiveSub]  = useState(null)
  const [usage,      setUsage]      = useState({ garments_used:0, poses_used:0 })
  const [selPlan,    setSelPlan]    = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [paying,     setPaying]     = useState(false)

  useEffect(() => {
    load()
    // Load Razorpay script
    if (!window.Razorpay) {
      const s = document.createElement('script')
      s.src = 'https://checkout.razorpay.com/v1/checkout.js'
      document.body.appendChild(s)
    }
  }, [])

  async function load() {
    setLoading(true)
    const [p, s, u] = await Promise.all([
      getPlans(),
      getActiveSubscription(learner.id),
      getUsage(learner.id),
    ])
    setPlans(p.filter(pl => pl.slug !== 'free')) // free is admin-only
    setActiveSub(s)
    setUsage(u)
    setLoading(false)
  }

  async function handlePay(plan) {
    if (!plan || paying) return
    setPaying(true)
    try {
      // Create order
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_inr: plan.price_inr,
          learner_id: learner.id,
          plan_slug: plan.slug,
          plan_name: plan.name,
        }),
      })
      const { order_id, amount, currency, key_id, error } = await res.json()
      if (error) throw new Error(error)

      // Open Razorpay checkout
      const options = {
        key: key_id,
        amount,
        currency,
        name: 'Skillinabox',
        description: `${plan.name} — Portfolio Platform`,
        order_id,
        prefill: { name: learner.name, email: learner.email, contact: learner.phone || '' },
        theme: { color: G },
        handler: async (response) => {
          // Verify payment
          const vRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id:   response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature:  response.razorpay_signature,
              learner_id:          learner.id,
              plan_id:             plan.id,
              amount_paid:         amount,
              duration_months:     plan.duration_months,
              free_months:         plan.free_months,
            }),
          })
          const vData = await vRes.json()
          if (vData.success) {
            await load()
            if (onSubscribed) onSubscribed()
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
      setPaying(false)
    }
    setPaying(false)
  }

  const isExpired = learner.subscription_status === 'expired'
  const isActive  = ['active','trial'].includes(learner.subscription_status) && activeSub
  const daysLeft  = activeSub ? Math.max(0, Math.ceil((new Date(activeSub.end_date) - new Date()) / 86400000)) : 0

  const activePlan = activeSub?.subscription_plans

  if (loading) return <div style={{ padding:40, textAlign:'center' }}><Spinner color={G}/></div>

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif" }}>

      {/* Active subscription status */}
      {isActive && (
        <div style={{ background: activeSub.status==='trial' ? '#FEF3E2' : '#E6F4EC', border: `1px solid ${activeSub.status==='trial'?'#F59E0B':'#52B27A'}`, borderRadius:12, padding:'16px 20px', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color: activeSub.status==='trial'?'#92400E':'#0D6B3A' }}>
              {activeSub.status==='trial' ? '🎁 Free Trial Active' : '✓ Subscription Active'}
            </div>
            <div style={{ fontSize:13, color: activeSub.status==='trial'?'#B45309':'#166534', marginTop:3 }}>
              {activePlan?.name} · {daysLeft} day{daysLeft!==1?'s':''} remaining · expires {new Date(activeSub.end_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
            </div>
          </div>
          {daysLeft <= 7 && (
            <div style={{ fontSize:12, color:'#92400E', background:'#FEF3E2', padding:'4px 12px', borderRadius:99, fontWeight:500 }}>
              ⚠ Renew soon
            </div>
          )}
        </div>
      )}

      {/* Expired banner */}
      {isExpired && (
        <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', borderRadius:12, padding:'16px 20px', marginBottom:24 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#991B1B', marginBottom:4 }}>Subscription expired</div>
          <div style={{ fontSize:13, color:'#B91C1C' }}>Your portfolio is unpublished and LIA features are disabled. Choose a plan below to reactivate.</div>
        </div>
      )}

      {/* Usage meter */}
      {isActive && activePlan && (
        <div style={{ background:'#fff', border:'1px solid #E8E6E2', borderRadius:12, padding:'16px 20px', marginBottom:24 }}>
          <div style={{ fontSize:13, fontWeight:600, marginBottom:14, color:'#111' }}>This month's usage — {currentMonth()}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <UsageMeter label="Garments uploaded" used={usage.garments_used} limit={activePlan.garment_limit} color="#5B21B6"/>
            <UsageMeter label="LIA poses generated" used={usage.poses_used} limit={activePlan.pose_limit} color={G}/>
          </div>
        </div>
      )}

      {/* Plans */}
      <div style={{ fontSize:11, fontWeight:600, color:'#aaa', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:16 }}>
        {isActive ? 'Upgrade or renew' : 'Choose a plan'}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14 }}>
        {plans.map(plan => {
          const isCurrentPlan = activeSub?.plan_id === plan.id && isActive
          const isBest = plan.slug === '12month'
          const isSel = selPlan?.id === plan.id

          return (
            <div key={plan.id} onClick={()=>setSelPlan(plan)}
              style={{ background:'#fff', border:`${isSel?'2px':'1px'} solid ${isSel?G:isBest?'#F4622A44':'#E8E6E2'}`, borderRadius:14, padding:'20px 18px', cursor:'pointer', transition:'all .15s', position:'relative', boxShadow: isSel?`0 4px 20px rgba(244,98,42,.15)`:'none' }}>

              {isBest && !isCurrentPlan && (
                <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:G, color:'#fff', fontSize:10, fontWeight:600, padding:'2px 12px', borderRadius:99, whiteSpace:'nowrap' }}>Best value</div>
              )}
              {isCurrentPlan && (
                <div style={{ position:'absolute', top:-10, left:'50%', transform:'translateX(-50%)', background:'#0D6B3A', color:'#fff', fontSize:10, fontWeight:600, padding:'2px 12px', borderRadius:99, whiteSpace:'nowrap' }}>Current plan</div>
              )}

              <div style={{ fontSize:14, fontWeight:600, color:'#111', marginBottom:4 }}>{plan.name}</div>
              <div style={{ fontSize:24, fontWeight:700, color:G, marginBottom:2 }}>
                ₹{Number(plan.price_inr).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize:12, color:'#888', marginBottom:12 }}>
                {plan.duration_months + plan.free_months} month{plan.duration_months+plan.free_months!==1?'s':''} access
                {plan.free_months>0&&<span style={{ color:'#0D6B3A', fontWeight:500 }}> · {plan.free_months} month free</span>}
              </div>
              <div style={{ fontSize:12, color:'#555', lineHeight:1.6 }}>{plan.description}</div>
              <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid #F5F3F0', display:'flex', flexDirection:'column', gap:4 }}>
                <div style={{ fontSize:11, color:'#888' }}>
                  {plan.garment_limit === -1 ? '✓ Unlimited garments' : `✓ ${plan.garment_limit} garments/month`}
                </div>
                <div style={{ fontSize:11, color:'#888' }}>
                  {plan.pose_limit === -1 ? '✓ Unlimited LIA poses' : `✓ ${plan.pose_limit} LIA poses/month`}
                </div>
                <div style={{ fontSize:11, color:'#888' }}>✓ Portfolio website</div>
              </div>
            </div>
          )
        })}
      </div>

      {selPlan && (
        <div style={{ marginTop:20, padding:'16px 20px', background:'#F7F6F4', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600 }}>{selPlan.name}</div>
            <div style={{ fontSize:13, color:'#888' }}>
              ₹{Number(selPlan.price_inr).toLocaleString('en-IN')} · {selPlan.duration_months + selPlan.free_months} months access
            </div>
          </div>
          <button style={btn('primary')} onClick={()=>handlePay(selPlan)} disabled={paying}>
            {paying ? <><Spinner size={14} color="#fff"/> Processing…</> : `Pay ₹${Number(selPlan.price_inr).toLocaleString('en-IN')} →`}
          </button>
        </div>
      )}

      <div style={{ marginTop:20, fontSize:12, color:'#bbb', textAlign:'center' }}>
        Secure payment powered by Razorpay · All prices include GST
      </div>
    </div>
  )
}

function UsageMeter({ label, used, limit, color }) {
  const pct = limit === -1 ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const isHigh = pct >= 80
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
        <span style={{ fontSize:12, color:'#555' }}>{label}</span>
        <span style={{ fontSize:12, fontWeight:600, color: isHigh?'#C94E1E':color }}>
          {used} / {limit === -1 ? '∞' : limit}
        </span>
      </div>
      <div style={{ height:6, background:'#F0EEE9', borderRadius:99, overflow:'hidden' }}>
        {limit !== -1 && (
          <div style={{ height:'100%', width:`${pct}%`, background: isHigh?'#C94E1E':color, borderRadius:99, transition:'width .3s' }}/>
        )}
      </div>
      {isHigh && limit !== -1 && (
        <div style={{ fontSize:11, color:'#C94E1E', marginTop:4 }}>Running low — consider upgrading</div>
      )}
    </div>
  )
}
