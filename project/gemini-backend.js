import { createServer } from 'http';
import fs from 'fs';

// Parse .env with cleaning
const envVars = {};
try {
  const envFile = fs.readFileSync('.env', 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...rest] = line.split('=');
    if (key && rest.length > 0) {
      let val = rest.join('=').trim();
      if (val.endsWith(';')) val = val.slice(0, -1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1).trim();
      }
      envVars[key.trim()] = val;
    }
  });
} catch(e) {}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || envVars['GEMINI_API_KEY'];

async function callGeminiApi(mimeType, cleanBase64, prompt) {
  const models = ['gemini-3.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[Gemini OCR] Trying model: ${model}...`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType, data: cleanBase64 } },
                { text: prompt }
              ]
            }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`[Gemini OCR] Model ${model} responded successfully.`);
        return data;
      } else {
        lastError = await response.text();
        console.warn(`[Gemini OCR] Model ${model} error ${response.status}: ${lastError}`);
      }
    } catch (e) {
      lastError = e.message;
      console.warn(`[Gemini OCR] Model ${model} exception: ${e.message}`);
    }
  }

  throw new Error(`Gemini API Error: ${lastError}`);
}

async function callGeminiApiText(prompt) {
  const models = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      console.log(`[Gemini Chatbot] Querying model: ${model}...`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: prompt }]
            }]
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log(`[Gemini Chatbot] Model ${model} responded successfully.`);
        return data;
      } else {
        lastError = await response.text();
        console.warn(`[Gemini Chatbot] Model ${model} error ${response.status}: ${lastError}`);
      }
    } catch (e) {
      lastError = e.message;
      console.warn(`[Gemini Chatbot] Model ${model} exception: ${e.message}`);
    }
  }

  throw new Error(`Gemini Text API Error: ${lastError}`);
}

const server = createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  if (req.method === 'POST' && req.url === '/api/chatbot') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { prompt, userContext, language } = JSON.parse(body);

        const profileInfo = userContext?.profile
          ? `User: ${userContext.profile.full_name || 'User'} (Email: ${userContext.profile.email || 'N/A'}, Role: ${userContext.profile.role || 'patient'})`
          : 'User: Unknown';

        const medsList = Array.isArray(userContext?.medications) && userContext.medications.length > 0
          ? userContext.medications.map((m, idx) => `${idx + 1}. ${m.name} (${m.dosage || 'N/A'}) - Form: ${m.form || 'Pills'}, Stock: ${m.stock_quantity}, Threshold: ${m.refill_threshold}, Doctor: ${m.prescribing_doctor || 'N/A'}, Condition: ${m.condition || 'N/A'}, Instructions: ${m.instructions || 'None'}`).join('\n')
          : 'No active medications registered.';

        const schedsList = Array.isArray(userContext?.schedules) && userContext.schedules.length > 0
          ? userContext.schedules.map((s, idx) => `${idx + 1}. Medication: ${s.medication?.name || s.medication_id} | Frequency: ${s.frequency} | Times: ${s.times?.join(', ')} | Dose Amount: ${s.dose_amount || '1'} | With Food: ${s.with_food ? 'Yes' : 'No'}`).join('\n')
          : 'No active schedules configured.';

        const fullPrompt = `You are PillSync AI 🤖, an intelligent, friendly, and expert medication and health assistant.

CURRENT USER LOGIN & PROFILE:
${profileInfo}

USER'S LOGGED-IN MEDICATIONS:
${medsList}

USER'S LOGGED-IN SCHEDULES:
${schedsList}

LANGUAGE TO RESPOND IN: ${language || 'en'} (Respond in ${language === 'hi' ? 'Hindi' : language === 'ta' ? 'Tamil' : language === 'te' ? 'Telugu' : 'English'})

USER QUESTION: "${prompt}"

INSTRUCTIONS FOR YOUR RESPONSE:
1. If the user asks for your name or identity, reply that you are PillSync AI, their personal medication & health assistant.
2. If the user asks about their login profile (e.g. "what is my name", "who am I", "my email"), answer with their name and profile details from the context above.
3. If the user asks about ALL medicines or schedules in this login (e.g. "information about all the medicines and schedules in that login", "list my medicines", "show my schedules"), summarize ALL their medications, dosages, stock, doctor, and schedule times clearly using bullet points and emojis.
4. If the user asks about any medicine, purpose, side effects, dosage, health condition, wellness tip, or general question, provide helpful, clear, and accurate answers.
5. Make your response well-formatted (use bullet points, bold headers, concise paragraphs). Keep the tone encouraging, clear, and helpful.`;

        const geminiData = await callGeminiApiText(fullPrompt);
        const answerText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I am PillSync AI. How can I assist you today?";

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: answerText }));
      } catch (err) {
        console.error("[Gemini Chatbot Error]:", err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/api/prescription-ai') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', async () => {
      try {
        const { fileBase64, fileExt, fileName } = JSON.parse(body);
        
        const cleanBase64 = fileBase64.includes('base64,') ? fileBase64.split('base64,')[1] : fileBase64;
        
        const mimeMap = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'webp': 'image/webp', 'gif': 'image/gif', 'svg': 'image/svg+xml'
        };
        const mimeType = mimeMap[(fileExt || 'png').toLowerCase()] || 'image/jpeg';

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

        const geminiData = await callGeminiApi(mimeType, cleanBase64, geminiPrompt);
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
        console.error("[Gemini Server Error]:", err);
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

