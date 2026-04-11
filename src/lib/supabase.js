import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export async function tagGarment(base64, mimeType) {
  const res = await fetch('/api/tag-garment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_base64: base64, mime_type: mimeType }),
  })
  if (!res.ok) throw new Error('Tagging failed')
  return res.json()
}

export async function uploadGarmentImage(learnerId, garmentId, file) {
  const ext = file.name.split('.').pop()
  const path = `${learnerId}/${garmentId}.${ext}`
  const { error } = await supabase.storage.from('garments').upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('garments').getPublicUrl(path)
  return publicUrl
}

export function makeSlug(text) {
  return (text || 'portfolio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
