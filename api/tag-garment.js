export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { image_base64, mime_type } = req.body
    if (!image_base64 || !mime_type) return res.status(400).json({ error: 'Missing fields' })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime_type, data: image_base64 } },
            { type: 'text', text: `Fashion expert for an Indian fashion platform. Analyse this garment and return ONLY valid JSON, no other text:
{"name":"full descriptive garment name","category":"one of: Indian wear — Anarkali | Indian wear — Saree | Indian wear — Lehenga | Indian wear — Kurti set | Indian wear — Salwar suit | Western wear — Dress | Western wear — Top | Western wear — Coord set | Fusion | Bridal wear","fabric":"fabric types","features":"2-4 key features comma separated","colour":"primary colours","occasion":"occasions comma separated"}` }
          ]
        }]
      })
    })

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    let tags = {}
    try { tags = JSON.parse(text.replace(/```json|```/g, '').trim()) } catch { tags = {} }
    return res.status(200).json(tags)
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
