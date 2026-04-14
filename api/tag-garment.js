export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' })

  const body = req.body

  async function callClaude(messages, maxTokens = 400) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens, messages })
    })
    const d = await r.json()
    return d.content?.[0]?.text?.trim() || ''
  }

  try {
    // ── Generate collection description ──────────────────────
    if (body.gen_collection_desc) {
      const pieces = body.garment_names?.length ? body.garment_names.join(', ') : 'various garments'
      const text = await callClaude([{ role: 'user', content: `You are a fashion copywriter for a premium Indian fashion brand. Write a short, evocative 2-sentence collection description for a collection called "${body.collection_name}"${body.garment_names?.length ? ` featuring: ${pieces}` : ''}. Sound premium, poetic, aspirational. Return ONLY the description.` }])
      return res.status(200).json({ description: text })
    }

    // ── Generate garment description ─────────────────────────
    if (body.gen_garment_desc) {
      const text = await callClaude([{ role: 'user', content: `You are a fashion copywriter for a premium Indian fashion brand. Write a compelling 2-sentence product description for: ${body.garment_name} (${body.category || 'garment'}). Fabric: ${body.fabric || 'premium fabric'}. Features: ${body.features || 'handcrafted'}. Sound aspirational and premium. Return ONLY the description text.` }])
      return res.status(200).json({ description: text })
    }

    // ── Generate designer bio ─────────────────────────────────
    if (body.gen_bio) {
      const text = await callClaude([{ role: 'user', content: `Write a warm, professional 3-sentence bio for an Indian fashion designer named ${body.name} who runs "${body.brand || body.name}". Speciality: ${body.speciality || 'fashion design'}. Skills: ${body.skills || ''}. Expertise: ${body.expertise || ''}. They are a graduate of the Skillinabox fashion design programme. Sound authentic, aspirational, and personal. Return ONLY the bio text.` }])
      return res.status(200).json({ description: text })
    }

    // ── Expand expertise keywords into descriptions ───────────
    if (body.gen_expertise) {
      const text = await callClaude([{ role: 'user', content: `You are writing for an Indian fashion designer's portfolio. Take these expertise areas: "${body.expertise || ''}" and expand each into a one-line description (15-20 words). Format as: "Area Name — description". One per line. Speciality context: ${body.speciality || 'fashion'}. Return ONLY the formatted list, nothing else.` }])
      return res.status(200).json({ description: text })
    }

    // ── Tag garment from image ────────────────────────────────
    if (!body.image_base64 || !body.mime_type) return res.status(400).json({ error: 'Missing image' })

    const text = await callClaude([{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: body.mime_type, data: body.image_base64 } },
      { type: 'text', text: `Fashion expert for an Indian fashion platform. Analyse this garment and return ONLY valid JSON, no other text:
{"name":"full descriptive garment name","category":"one of: Indian wear — Anarkali | Indian wear — Saree | Indian wear — Lehenga | Indian wear — Kurti set | Indian wear — Salwar suit | Western wear — Dress | Western wear — Top | Western wear — Coord set | Fusion | Bridal wear | Menswear — Kurta | Menswear — Sherwani | Menswear — Suit | Menswear — Casual","fabric":"fabric types","features":"2-4 key features comma separated","colour":"primary colours","occasion":"occasions comma separated","description":"2 sentence premium product description","gender":"female or male based on the garment style and target wearer"}` }
    ]}], 700)

    let tags = {}
    try { tags = JSON.parse(text.replace(/```json|```/g, '').trim()) } catch { tags = {} }
    return res.status(200).json(tags)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
