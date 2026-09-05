import { createServer } from 'http';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/api/prescription-ai') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { fileBase64, fileExt, fileName } = JSON.parse(body);
        
        const cleanBase64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
        
        const mimeMap = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'webp': 'image/webp', 'gif': 'image/gif'
        };
        const mimeType = mimeMap[fileExt.toLowerCase()] || 'image/jpeg';

        const geminiPrompt = `You are analyzing a handwritten doctor's prescription. Carefully inspect each prescription line and identify the medicine name written on that line. Do not rely only on OCR-like text extraction. Use the visual context of the image to understand the handwriting.

Extract ONLY medicines.
Return ONLY valid JSON. No explanations, no markdown, no \`\`\`json block.

Return a JSON object containing a \`medicines\` array. For every medicine, add an object to the array:
{
  "medicines": [
    {
      "name": "actual medicine name written on prescription",
      "strength": "actual strength",
      "dosage": "actual dosage",
      "form": "tablet/capsule/etc",
      "quantity": "actual quantity",
      "frequency": "actual frequency",
      "timing": "actual timing",
      "duration": "actual duration",
      "instructions": "actual instructions",
      "confidence": "high|medium|low",
      "needs_verification": true
    }
  ]
}

IMPORTANT RULES:
1. The \`name\` field is REQUIRED whenever you can read it.
2. DO NOT use dosage or strength as the medicine name (e.g. do not put "25 mg" in the name field).
3. If the name is unclear, return your best interpretation with "confidence": "low" and "needs_verification": true.
4. If the name genuinely cannot be read at all, return null for name.
5. Do NOT invent or guess a medicine if it is not actually written in the image.

If no medicines can be identified at all, return:
{
  "medicines": [],
  "overall_confidence": "low",
  "needs_manual_review": true,
  "message": "No medicines could be confidently extracted."
}`;

        const geminiResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inlineData: { mimeType, data: cleanBase64 } },
                  { text: geminiPrompt }
                ]
              }],
              generationConfig: { responseMimeType: "application/json" },
            }),
          }
        );

        if (!geminiResponse.ok) {
          const errText = await geminiResponse.text();
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Gemini API Error: ' + errText }));
        }

        const geminiData = await geminiResponse.json();
        let textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        // Strip markdown if present
        textResult = textResult.replace(/^```json/im, '').replace(/^```/im, '').replace(/```$/im, '').trim();

        let parsedResult;
        try {
          parsedResult = JSON.parse(textResult);
        } catch(e) {
          parsedResult = { medicines: [], error: 'Failed to parse Gemini output' };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(parsedResult));
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(3001, () => {
  console.log('Gemini Backend running on http://localhost:3001');
});
