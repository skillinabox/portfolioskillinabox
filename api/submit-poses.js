// api/submit-poses.js
// Submits pose generation to Fashn.ai, returns prediction IDs immediately.

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

  const apiKey = process.env.FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN_API_KEY not configured' })

  const { garment_image_url, gender = 'female', pose_keys } = req.body
  if (!garment_image_url) return res.status(400).json({ error: 'Missing garment_image_url' })

  const prompts = POSES[gender] || POSES.female
  const keys = pose_keys?.length ? pose_keys : ['front', 'back', 'walking', 'sitting']
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
