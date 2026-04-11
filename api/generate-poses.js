// api/generate-poses.js
// Calls Fashn.ai Product-to-Model API to generate model poses from a garment image
// Polls until complete then returns all pose URLs

const POSES = [
  { key: 'front',   prompt: 'Indian woman, front view, confident pose, clean studio background, professional fashion photography' },
  { key: 'side',    prompt: 'Indian woman, side profile view, elegant pose, clean studio background, professional fashion photography' },
  { key: 'walking', prompt: 'Indian woman, walking pose, dynamic movement, lifestyle outdoor background, fashion editorial' },
  { key: 'sitting', prompt: 'Indian woman, sitting pose, graceful, neutral background, professional fashion photography' },
]

async function submitPose(garmentImageUrl, prompt, apiKey) {
  const res = await fetch('https://api.fashn.ai/v1/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model_name: 'product-to-model',
      inputs: {
        product_image: garmentImageUrl,
        prompt,
        aspect_ratio: '3:4',
        generation_mode: 'balanced',
        output_format: 'png',
      },
    }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'Submit failed')
  return data.id
}

async function pollStatus(predictionId, apiKey, maxAttempts = 40) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 4000)) // wait 4s between polls
    const res = await fetch(`https://api.fashn.ai/v1/status/${predictionId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    const data = await res.json()
    if (data.status === 'completed' && data.output?.length) return data.output[0]
    if (data.status === 'failed') throw new Error(data.error || 'Generation failed')
  }
  throw new Error('Timed out waiting for pose generation')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN_API_KEY not configured in Vercel environment variables' })

  const { garment_image_url, pose_key } = req.body
  if (!garment_image_url) return res.status(400).json({ error: 'Missing garment_image_url' })

  try {
    // If a specific pose is requested, generate just that one
    // Otherwise generate all 4
    const posesToGenerate = pose_key
      ? POSES.filter(p => p.key === pose_key)
      : POSES

    const results = {}

    for (const pose of posesToGenerate) {
      try {
        const predId = await submitPose(garment_image_url, pose.prompt, apiKey)
        const imageUrl = await pollStatus(predId, apiKey)
        results[pose.key] = imageUrl
      } catch (err) {
        results[pose.key] = null
        console.error(`Pose ${pose.key} failed:`, err.message)
      }
    }

    return res.status(200).json({ poses: results })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
