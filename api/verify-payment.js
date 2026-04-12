// api/verify-payment.js
// Verifies Razorpay payment signature and activates subscription in Supabase

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

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, learner_id, plan_id, amount_paid, duration_months, free_months } = req.body

  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id
  const expected = crypto.createHmac('sha256', keySecret).update(body).digest('hex')
  if (expected !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification failed — invalid signature' })
  }

  try {
    // Calculate subscription end date
    const totalMonths = (duration_months || 1) + (free_months || 0)
    const endDate = new Date()
    endDate.setMonth(endDate.getMonth() + totalMonths)

    // Create subscription record
    const { error: subErr } = await supabase.from('subscriptions').insert({
      learner_id,
      plan_id,
      status: 'active',
      start_date: new Date().toISOString(),
      end_date: endDate.toISOString(),
      razorpay_order_id,
      razorpay_payment_id,
      amount_paid: amount_paid / 100, // convert from paise
      granted_by_admin: false,
    })
    if (subErr) throw new Error(subErr.message)

    // Update learner subscription status
    const { error: lrnErr } = await supabase.from('learners').update({
      subscription_status: 'active',
      subscription_end: endDate.toISOString(),
    }).eq('id', learner_id)
    if (lrnErr) throw new Error(lrnErr.message)

    return res.status(200).json({ success: true, end_date: endDate.toISOString() })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
