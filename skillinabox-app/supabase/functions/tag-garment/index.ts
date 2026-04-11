// supabase/functions/tag-garment/index.ts
// Deploy with: supabase functions deploy tag-garment
// Set secret: supabase secrets set ANTHROPIC_API_KEY=your-key

import Anthropic from "npm:@anthropic-ai/sdk@^0.27.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { image_base64, mime_type } = await req.json();

    if (!image_base64 || !mime_type) {
      return new Response(JSON.stringify({ error: "Missing image_base64 or mime_type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const client = new Anthropic({
      apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mime_type, data: image_base64 },
          },
          {
            type: "text",
            text: `You are a fashion expert for an Indian fashion portfolio platform. Analyse this garment image carefully and return ONLY valid JSON with no other text, preamble, or markdown:
{"name":"full descriptive garment name with style and key detail","category":"one of exactly: Indian wear — Anarkali | Indian wear — Saree | Indian wear — Lehenga | Indian wear — Kurti set | Indian wear — Salwar suit | Western wear — Dress | Western wear — Top | Western wear — Coord set | Fusion | Bridal wear","fabric":"fabric type(s)","features":"2-4 key design features comma separated","colour":"primary colour(s)","occasion":"suitable occasions comma separated"}`,
          },
        ],
      }],
    });

    const text = response.content[0]?.text || "{}";
    let tags = {};
    try {
      tags = JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch {
      tags = { name: "", category: "", fabric: "", features: "", colour: "", occasion: "" };
    }

    return new Response(JSON.stringify(tags), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
