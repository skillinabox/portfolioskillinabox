import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Tag a garment image via Supabase Edge Function
export async function tagGarment(imageBase64, mimeType) {
  const { data, error } = await supabase.functions.invoke('tag-garment', {
    body: { image_base64: imageBase64, mime_type: mimeType },
  })
  if (error) throw error
  return data
}

// Upload a garment image to Supabase Storage
export async function uploadGarmentImage(learnerId, garmentId, file) {
  const ext = file.name.split('.').pop()
  const path = `${learnerId}/${garmentId}.${ext}`
  const { error } = await supabase.storage.from('garments').upload(path, file, { upsert: true })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('garments').getPublicUrl(path)
  return publicUrl
}

// Generate a URL-safe slug from a brand name
export function makeSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'portfolio'
}
