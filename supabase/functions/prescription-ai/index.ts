import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.39.8";
import { decodeBase64 } from "jsr:@std/encoding@0.224.0/base64";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GEMINI_API_KEY = Deno.env.get("GOOGLE_API_KEY") || Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not configured.");
      return new Response(
        JSON.stringify({ error: "Google Gemini API key is not configured on the backend." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Supabase environment variables are missing.");
      return new Response(
        JSON.stringify({ error: "Supabase configuration missing on backend." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate user from the Authorization Header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Missing authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("User authentication failed:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized session." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request body for file base64 data
    const { fileBase64, fileExt, fileName } = await req.json().catch(() => ({}));
    if (!fileBase64) {
      console.error("Missing fileBase64 in request body.");
      return new Response(
        JSON.stringify({ error: "fileBase64 is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!fileExt) {
      console.error("Missing fileExt in request body.");
      return new Response(
        JSON.stringify({ error: "fileExt is required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Parsed request body: fileExt=${fileExt}, fileName=${fileName || 'unknown'}`);

    const userId = user.id;
    const uploadPath = `${userId}/${Date.now()}.${fileExt}`;
    console.log(`Uploading file securely for user ${userId} to path: prescriptions/${uploadPath}`);

    // 3. Convert base64 data back to binary bytes
    let fileBytes;
    // Strip possible data URL prefix (e.g., "data:image/png;base64,")
    const cleanBase64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
    try {
      fileBytes = decodeBase64(cleanBase64);
    } catch (e) {
      console.error("Base64 decoding failed.");
      return new Response(
        JSON.stringify({ error: "Invalid base64 encoding." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (fileBytes.byteLength === 0) {
      console.error("Decoded file is empty.");
      return new Response(
        JSON.stringify({ error: "Decoded file is empty." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine mimeType
    const mimeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'webp': 'image/webp',
      'gif': 'image/gif'
    };
    const mimeType = mimeMap[fileExt.toLowerCase()];

    // Safe diagnostics (no secrets)
    console.log(`Decoded byte length: ${fileBytes.byteLength}`);
    console.log(`MIME type: ${mimeType}`);
    console.log(`File extension: ${fileExt}`);
    console.log(`File bytes non‑empty: ${fileBytes.byteLength > 0}`);
    
    if (!mimeType) {
      console.error(`Unsupported file extension: ${fileExt}`);
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${fileExt}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Determined mimeType: ${mimeType}`);

    // 4. Securely upload the file to Supabase Storage using the Service Role client (bypassing Storage RLS)
    const fileBlob = new Blob([fileBytes], { type: mimeType });
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('prescriptions')
        .upload(uploadPath, fileBlob, {
          contentType: mimeType,
          upsert: true
        });

    if (uploadError) {
      console.error("Secure Storage upload failed:", uploadError);
      return new Response(
        JSON.stringify({ error: `Secure prescription upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Secure storage upload completed. Path: ${uploadData.path}`);

    // Prepare Gemini Prompt
    const geminiPrompt = `You are an experienced pharmacist and prescription analysis assistant.
Your job is to analyze the uploaded prescription IMAGE directly.
DO NOT perform generic OCR. Understand the prescription exactly as a trained pharmacist would.
Never guess medicines. If handwriting is unclear, return a lower confidence score.

Ignore completely:
- Doctor Name
- Doctor Qualification
- Hospital Name
- Hospital Logo
- Registration Number
- Patient Name
- Age
- Gender
- Address
- Phone Number
- Email
- Website
- Date
- Signature
- Stamp
- General Notes

Extract ONLY medicines.
Return ONLY valid JSON. No explanations, no markdown, no \`\`\`json block.

Example JSON output structure:
{
  "medicines": [
    {
      "medicine_name": "Augmentin",
      "brand_name": "Augmentin",
      "generic_name": "Amoxicillin + Clavulanic Acid",
      "strength": "625 mg",
      "dosage": "1 Tablet",
      "frequency": "Twice Daily",
      "duration": "5 Days",
      "morning": true,
      "afternoon": false,
      "night": true,
      "food": "After Food",
      "instructions": "Take after meals",
      "confidence": 98
    }
  ]
}

If no medicines can be identified or the image does not appear to be a medical prescription, return this JSON:
{
  "medicines": [],
  "overall_confidence": "low",
  "needs_manual_review": true,
  "message": "No medicines could be confidently extracted."
}`;

    console.log("Calling Google Gemini Multimodal API with image...");
    // 5. Call Gemini API with multimodal input
    console.log(`Sending Gemini request: mimeType=${mimeType}, base64Length=${cleanBase64.length}`);
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: cleanBase64
                  }
                },
                {
                  text: geminiPrompt
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error(`Gemini API returned error status ${geminiResponse.status}:`, errorText);
      // Return detailed Gemini error response to frontend
      const errorDetail = await geminiResponse.text();
      console.error('Gemini API error:', geminiResponse.status, errorDetail);
      return new Response(
        JSON.stringify({ error: `Gemini API error: ${errorDetail}` }),
        { status: geminiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await geminiResponse.json();
    const geminiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    let parsedResult;
    try {
      parsedResult = JSON.parse(geminiText.trim());
    } catch (e) {
      console.error("Failed to parse JSON response from Gemini:", geminiText);
      return new Response(
        JSON.stringify({
          medicines: [],
          overall_confidence: "low",
          needs_manual_review: true,
          message: "Failed to interpret the AI response structure."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Gemini Multimodal analysis completed. Found ${parsedResult.medicines?.length || 0} medicines.`);

    // Include the generated upload path so the frontend knows where to save it
    parsedResult.filePath = uploadPath;

    return new Response(
      JSON.stringify(parsedResult),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in prescription-ai function:", err?.message || err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
