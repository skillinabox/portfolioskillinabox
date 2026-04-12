// api/create-order.js
// Creates a Razorpay order for subscription payment

import crypto from 'crypto'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const keyId     = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) return res.status(500).json({ error: 'Razorpay keys not configured' })

  const { amount_inr, learner_id, plan_slug, plan_name } = req.body
  if (!amount_inr || !learner_id || !plan_slug) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
    const r = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount_inr * 100), // paise
        currency: 'INR',
        receipt: `snb_${learner_id.slice(0,8)}_${Date.now()}`,
        notes: { learner_id, plan_slug, plan_name },
      }),
    })
    const order = await r.json()
    if (!r.ok) throw new Error(order.error?.description || 'Order creation failed')
    return res.status(200).json({ order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
