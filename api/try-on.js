// api/try-on.js
// Virtual try-on using Fashn.ai tryon-v1.6
// Takes a person photo (model_image) + garment image → person wearing the garment
// Polls until complete and returns the result URL

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN_API_KEY not configured' })

  const { model_image_base64, garment_image_url } = req.body
  if (!model_image_base64 || !garment_image_url) {
    return res.status(400).json({ error: 'Missing model_image_base64 or garment_image_url' })
  }

  try {
    // Submit try-on job
    const submitRes = await fetch('https://api.fashn.ai/v1/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model_name: 'tryon-v1.6',
        inputs: {
          model_image: `data:image/jpeg;base64,${model_image_base64}`,
          garment_image: garment_image_url,
          output_format: 'png',
        },
      }),
    })

    const submitData = await submitRes.json()
    if (!submitRes.ok || submitData.error) {
      throw new Error(submitData.error || 'Submission failed')
    }

    const predictionId = submitData.id
    if (!predictionId) throw new Error('No prediction ID returned')

    // Poll for result — max 30 attempts × 4s = 2 minutes
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 4000))
      const pollRes = await fetch(`https://api.fashn.ai/v1/status/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      const pollData = await pollRes.json()
      if (pollData.status === 'completed' && pollData.output?.length) {
        return res.status(200).json({ result_url: pollData.output[0], prediction_id: predictionId })
      }
      if (pollData.status === 'failed') {
        throw new Error(pollData.error || 'Try-on generation failed')
      }
    }
    throw new Error('Timed out — try again in a moment')
  } catch(err) {
    return res.status(500).json({ error: err.message })
  }
}
