// api/check-poses.js
// Checks status of Fashn.ai prediction IDs and returns completed image URLs.
// Called repeatedly by the frontend until all poses are done.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.FASHN_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'FASHN_API_KEY not configured' })

  const { prediction_ids } = req.body
  if (!prediction_ids || typeof prediction_ids !== 'object') {
    return res.status(400).json({ error: 'Missing prediction_ids object' })
  }

  const results = {}
  const stillPending = {}

  for (const [poseKey, predId] of Object.entries(prediction_ids)) {
    try {
      const r = await fetch(`https://api.fashn.ai/v1/status/${predId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      const data = await r.json()

      if (data.status === 'completed' && data.output?.length) {
        results[poseKey] = data.output[0]
      } else if (data.status === 'failed') {
        results[poseKey] = null // mark as failed, don't retry
      } else {
        // still processing
        stillPending[poseKey] = predId
      }
    } catch (err) {
      stillPending[poseKey] = predId // keep trying
    }
  }

  return res.status(200).json({ results, still_pending: stillPending })
}
