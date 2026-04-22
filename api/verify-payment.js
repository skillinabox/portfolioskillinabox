// api/verify-payment.js
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keySecret) return res.status(500).json({ error: 'Razorpay not configured' })

  const {
    razorpay_order_id, razorpay_payment_id, razorpay_signature,
    learner_id, plan_id, amount_paid, duration_months, free_months, is_topup
  } = req.body

  // Verify signature
  const expected = crypto.createHmac('sha256', keySecret)
    .update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex')
  if (expected !== razorpay_signature)
    return res.status(400).json({ error: 'Payment verification failed — invalid signature' })

  try {
    if (is_topup) {
      // TOP-UP: add credits to current month's usage allowance
      // We do this by recording a topup record in subscriptions and
      // increasing usage limits by adding a usage_offset in learners table
      const { data: plan } = await supabase.from('subscription_plans')
        .select('garment_limit, pose_limit').eq('id', plan_id).single()

      if (plan) {
        // Get current month usage record and update limit overrides
        const month = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`
        const { data: usage } = await supabase.from('usage').select('*')
          .eq('learner_id', learner_id).eq('month', month).maybeSingle()

        if (usage) {
          // Add topup amounts to a bonus column
          await supabase.from('usage').update({
            garment_bonus: (usage.garment_bonus || 0) + plan.garment_limit,
            pose_bonus:    (usage.pose_bonus    || 0) + plan.pose_limit,
          }).eq('id', usage.id)
        } else {
          await supabase.from('usage').insert({
            learner_id, month,
            garments_used: 0, poses_used: 0,
            garment_bonus: plan.garment_limit,
            pose_bonus:    plan.pose_limit,
          })
        }
      }

      // Record topup payment
      await supabase.from('subscriptions').insert({
        learner_id, plan_id, status: 'topup',
        start_date: new Date().toISOString(),
        end_date:   new Date().toISOString(), // same day for topups
        razorpay_order_id, razorpay_payment_id,
        amount_paid: amount_paid / 100,
        granted_by_admin: false,
      })

      return res.status(200).json({ success: true, topup: true })
    }

    // REGULAR SUBSCRIPTION
    const totalMonths = (duration_months || 1) + (free_months || 0)
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + totalMonths)

    await supabase.from('subscriptions').insert({
      learner_id, plan_id, status: 'active',
      start_date: new Date().toISOString(),
      end_date:   endDate.toISOString(),
      razorpay_order_id, razorpay_payment_id,
      amount_paid: amount_paid / 100,
      granted_by_admin: false,
    })

    await supabase.from('learners').update({
      subscription_status: 'active',
      subscription_end:    endDate.toISOString(),
    }).eq('id', learner_id)

    return res.status(200).json({ success: true, end_date: endDate.toISOString() })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
