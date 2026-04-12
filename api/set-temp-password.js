// api/set-temp-password.js
// Admin-only — sets a temporary password for a learner
// Accepts email, looks up the user, updates their password
// Requires SUPABASE_SERVICE_KEY in Vercel env vars

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  const supabaseUrl = process.env.VITE_SUPABASE_URL

  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured in Vercel env vars. Add it in Vercel → Settings → Environment Variables.' })
  }

  const { email, user_id, password } = req.body
  if ((!email && !user_id) || !password) {
    return res.status(400).json({ error: 'Missing email/user_id or password' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' })
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    let uid = user_id

    // If email provided, look up the user ID first
    if (!uid && email) {
      const { data: users, error: listErr } = await adminClient.auth.admin.listUsers()
      if (listErr) throw new Error(listErr.message)
      const user = users.users.find(u => u.email === email)
      if (!user) throw new Error(`No account found for ${email}. The learner must sign up first.`)
      uid = user.id
    }

    const { error } = await adminClient.auth.admin.updateUserById(uid, { password })
    if (error) throw new Error(error.message)

    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
