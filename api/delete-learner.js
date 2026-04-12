// api/delete-learner.js
// Admin-only — completely deletes a learner and all associated data
// Deletes: subscriptions, usage, enquiries, garments (+ storage), learner record, auth user
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
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' })
  }

  const { learner_id, learner_email } = req.body
  if (!learner_id) return res.status(400).json({ error: 'Missing learner_id' })

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  try {
    // 1. Delete storage files (garment images, photos, logos)
    const { data: files } = await admin.storage.from('garments').list(learner_id)
    if (files?.length) {
      const paths = files.map(f => `${learner_id}/${f.name}`)
      await admin.storage.from('garments').remove(paths)
    }

    // 2. Delete usage records
    await admin.from('usage').delete().eq('learner_id', learner_id)

    // 3. Delete subscriptions
    await admin.from('subscriptions').delete().eq('learner_id', learner_id)

    // 4. Delete enquiries
    await admin.from('enquiries').delete().eq('learner_id', learner_id)

    // 5. Delete garments
    await admin.from('garments').delete().eq('learner_id', learner_id)

    // 6. Delete collections
    await admin.from('collections').delete().eq('learner_id', learner_id)

    // 7. Delete learner record
    await admin.from('learners').delete().eq('id', learner_id)

    // 8. Delete auth user if email provided
    if (learner_email) {
      const { data: users } = await admin.auth.admin.listUsers()
      const authUser = users?.users?.find(u => u.email === learner_email)
      if (authUser) {
        await admin.auth.admin.deleteUser(authUser.id)
      }
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
