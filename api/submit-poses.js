// api/submit-poses.js

// Demo pose images — free Unsplash fashion photos, rotating set
const DEMO_POSES = [
  'https://images.unsplash.com/photo-1583391733956-6c78276477e2?w=600&q=80', // front
  'https://images.unsplash.com/photo-1594938298603-c8148c4b4d05?w=600&q=80', // back
  'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=600&q=80', // left
  'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=600&q=80', // right
  'https://images.unsplash.com/photo-1552374196-1ab2a1c593e8?w=600&q=80', // walking
  'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80', // sitting
  'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=600&q=80', // closeup
  'https://images.unsplash.com/photo-1581044777550-4cfa60707c03?w=600&q=80', // outdoor
]

const POSES = {
  female: {
    front:   'Indian woman, front view, confident pose, clean studio background, professional fashion photography, full body shot',
    back:    'Indian woman, back view, clean studio background, professional fashion photography, full body shot',
    left:    'Indian woman, 3/4 left angle, elegant pose, clean studio background, professional fashion photography, full body shot',
    right:   'Indian woman, 3/4 right angle, elegant pose, clean studio background, professional fashion photography, full body shot',
    walking: 'Indian woman, walking pose, dynamic movement, lifestyle outdoor background, fashion editorial, full body shot',
    sitting: 'Indian woman, sitting pose, graceful, neutral background, professional fashion photography, full body shot',
    closeup: 'Indian woman, close-up upper body, detailed garment view, clean studio background, professional fashion photography',
    outdoor: 'Indian woman, outdoor lifestyle, natural light, full body shot, fashion editorial photography',
  },
  male: {
    front:   'Indian man, front view, confident pose, clean studio background, professional fashion photography, full body shot',
    back:    'Indian man, back view, clean studio background, professional fashion photography, full body shot',
    left:    'Indian man, 3/4 left angle, smart stance, clean studio background, professional fashion photography, full body shot',
    right:   'Indian man, 3/4 right angle, smart stance, clean studio background, professional fashion photography, full body shot',
    walking: 'Indian man, walking pose, dynamic movement, lifestyle outdoor background, fashion editorial, full body shot',
    sitting: 'Indian man, sitting pose, relaxed, neutral background, professional fashion photography, full body shot',
    closeup: 'Indian man, close-up upper body, detailed garment view, clean studio background, professional fashion photography',
    outdoor: 'Indian man, outdoor lifestyle, natural light, full body shot, fashion editorial photography',
  },
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { garment_image_url, gender = 'female', pose_keys, demo_mode } = req.body
  if (!garment_image_url) return res.status(400).json({ error: 'Missing garment_image_url' })

  const keys = pose_keys?.length ? pose_keys : ['front', 'back', 'walking', 'sitting']

  // ── Demo mode — return pre-loaded images instantly, no API call ──
  if (demo_mode) {
    const allKeys = ['front','back','left','right','walking','sitting','closeup','outdoor']
    const poses = {}
    keys.forEach((k, i) => {
      const idx = allKeys.indexOf(k)
      poses[k] = DEMO_POSES[idx !== -1 ? idx : i % DEMO_POSES.length]
    })
    return res.status(200).json({ poses_direct: poses }) // direct URLs, no polling needed
  }

  // ── Real API call ─────────────────────────────────────────
  const apiKey = process.env.FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN_API_KEY not configured' })

  const prompts = POSES[gender] || POSES.female
  const predictionIds = {}

  for (const key of keys) {
    const prompt = prompts[key]
    if (!prompt) continue
    try {
      const r = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model_name: 'product-to-model',
          inputs: { product_image: garment_image_url, prompt, aspect_ratio: '3:4', generation_mode: 'balanced', output_format: 'png' },
        }),
      })
      const data = await r.json()
      if (data.id) predictionIds[key] = data.id
    } catch(err) { console.error(`Submit ${key} failed:`, err.message) }
  }

  return res.status(200).json({ prediction_ids: predictionIds })
}
