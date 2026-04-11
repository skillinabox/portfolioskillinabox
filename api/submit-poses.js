// api/submit-poses.js
// Submits pose generation jobs to Fashn.ai and returns prediction IDs immediately.
// Does NOT wait for completion - that's handled by check-poses.js
// This keeps the function well within Vercel's timeout.

const POSES = {
  female: [
    { key:'front',   prompt:'Indian woman, front view, confident pose, clean studio background, professional fashion photography, full body shot' },
    { key:'side',    prompt:'Indian woman, side profile view, elegant stance, clean studio background, professional fashion photography, full body shot' },
    { key:'walking', prompt:'Indian woman, walking pose, dynamic movement, lifestyle outdoor background, fashion editorial, full body shot' },
    { key:'sitting', prompt:'Indian woman, sitting pose, graceful, neutral background, professional fashion photography, full body shot' },
  ],
  male: [
    { key:'front',   prompt:'Indian man, front view, confident pose, clean studio background, professional fashion photography, full body shot' },
    { key:'side',    prompt:'Indian man, side profile view, smart stance, clean studio background, professional fashion photography, full body shot' },
    { key:'walking', prompt:'Indian man, walking pose, dynamic movement, lifestyle outdoor background, fashion editorial, full body shot' },
    { key:'sitting', prompt:'Indian man, sitting pose, relaxed, neutral background, professional fashion photography, full body shot' },
  ],
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN_API_KEY not configured' })

  const { garment_image_url, gender = 'female', pose_key } = req.body
  if (!garment_image_url) return res.status(400).json({ error: 'Missing garment_image_url' })

  const poses = POSES[gender] || POSES.female
  const toSubmit = pose_key ? poses.filter(p => p.key === pose_key) : poses

  const predictionIds = {}

  for (const pose of toSubmit) {
    try {
      const r = await fetch('https://api.fashn.ai/v1/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model_name: 'product-to-model',
          inputs: {
            product_image: garment_image_url,
            prompt: pose.prompt,
            aspect_ratio: '3:4',
            generation_mode: 'balanced',
            output_format: 'png',
          },
        }),
      })
      const data = await r.json()
      if (data.id) predictionIds[pose.key] = data.id
    } catch (err) {
      console.error(`Submit ${pose.key} failed:`, err.message)
    }
  }

  return res.status(200).json({ prediction_ids: predictionIds })
}
