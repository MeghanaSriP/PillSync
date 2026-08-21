import { createServer } from 'http';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import nodemailer from 'nodemailer';

// Load .env
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || envVars['VITE_SUPABASE_URL'];
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || envVars['VITE_SUPABASE_ANON_KEY'];
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || envVars['SUPABASE_SERVICE_ROLE_KEY'] || SUPABASE_KEY;

const SMTP_USER = process.env.SMTP_USER || envVars['SMTP_USER'];
let SMTP_PASS = process.env.SMTP_PASS || envVars['SMTP_PASS'];
if (SMTP_PASS && ((SMTP_PASS.startsWith('"') && SMTP_PASS.endsWith('"')) || (SMTP_PASS.startsWith("'") && SMTP_PASS.endsWith("'")))) {
  SMTP_PASS = SMTP_PASS.slice(1, -1);
}
const FROM_EMAIL = SMTP_USER || "onboarding@resend.dev";

// Default client (unauthenticated or service role)
const defaultSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// In-memory store for active user access tokens to query Supabase with user RLS context
const userTokens = new Map(); // tokenString -> timestamp

function registerToken(token) {
  if (!token) return;
  userTokens.set(token, Date.now());
}

// Clean tokens older than 24 hours
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [t, ts] of userTokens.entries()) {
    if (ts < cutoff) userTokens.delete(t);
  }
}, 3600000);

// Helper to create an authenticated Supabase client for a token
function getSupabaseClient(token) {
  if (!token) return defaultSupabase;
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });
}

// Create Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  }
});

async function sendEmail(to, subject, html) {
  if (!SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP_USER or SMTP_PASS not configured on backend.");
  }
  
  const info = await transporter.sendMail({
    from: `"PillSync" <${FROM_EMAIL}>`,
    to: to,
    subject: subject,
    html: html
  });
  
  return info;
}

// Helper: Format timezone specific date and time
function getTzDateTime(tz) {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const parts = fmt.formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value ?? "00";
    const year = Number(get("year"));
    const month = Number(get("month"));
    const day = Number(get("day"));
    let hour = get("hour");
    if (hour === "24") hour = "00";
    const minute = get("minute");

    const localDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const localHHMM = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const utcDate = new Date(Date.UTC(year, month - 1, day));
    const localDow = utcDate.getUTCDay();

    return { localDateStr, localHHMM, localDow, year, month, day };
  } catch (e) {
    const now = new Date();
    const localHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return {
      localDateStr: now.toISOString().split("T")[0],
      localHHMM: localHHMM,
      localDow: now.getDay(),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };
  }
}

function fmtTimeLabel(time) {
  if (!time) return '';
  const cleanTime = time.slice(0, 5);
  const [h, m] = cleanTime.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

function normalizeTime(timeStr) {
  if (!timeStr) return '';
  return timeStr.slice(0, 5);
}

function doseEmailHtml(name, medName, dosage, time, instructions) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;text-align:center">
      <h1 style="margin:0;font-size:20px">PillSync Reminder</h1>
    </div>
    <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px">
      <p style="margin:0 0 8px;color:#64748b;font-size:14px">Hi ${name},</p>
      <p style="margin:0 0 20px;color:#0f172a;font-size:16px">It's time to take your medication:</p>
      <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 20px;margin-bottom:20px">
        <p style="margin:0 0 4px;font-size:18px;font-weight:bold;color:#0f766e">${medName}</p>
        <p style="margin:0;color:#334155;font-size:14px">${dosage}${instructions ? ` &middot; ${instructions}` : ""}</p>
        <p style="margin:8px 0 0;color:#64748b;font-size:13px">Scheduled at ${fmtTimeLabel(time)}</p>
      </div>
      <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5">Log this dose in your PillSync app once you've taken it to keep your adherence tracking up to date.</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">PillSync does not replace professional medical advice.</p>
  </div></body></html>`;
}

function summaryEmailHtml(name, doses, dateLabel) {
  const rows = doses
    .sort((a, b) => normalizeTime(a.time).localeCompare(normalizeTime(b.time)))
    .map((d) => `<tr><td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;font-weight:bold;color:#0f766e">${fmtTimeLabel(d.time)}</td><td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#0f172a">${d.medName}<br><span style="color:#64748b;font-size:12px">${d.dosage}</span></td></tr>`)
    .join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;text-align:center">
      <h1 style="margin:0;font-size:20px">Today's Medication Summary</h1>
    </div>
    <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px">
      <p style="margin:0 0 8px;color:#64748b;font-size:14px">Hi ${name},</p>
      <p style="margin:0 0 20px;color:#0f172a;font-size:16px">Here are your scheduled doses for ${dateLabel}:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr style="background:#f8fafc"><td style="padding:10px 16px;color:#64748b;font-size:12px;text-transform:uppercase">Time</td><td style="padding:10px 16px;color:#64748b;font-size:12px;text-transform:uppercase">Medication</td></tr></thead><tbody>${rows}</tbody></table>
      <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.5">Open PillSync to log each dose as you take it.</p>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:11px;margin-top:20px">PillSync does not replace professional medical advice.</p>
  </div></body></html>`;
}

// --- HTTP SERVER ---
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // Extract auth token if provided in header
  const authHeader = req.headers['authorization'];
  let reqToken = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    reqToken = authHeader.split(' ')[1];
    registerToken(reqToken);
  }

  // Caregiver Invitation Endpoint
  if (req.method === 'POST' && req.url === '/api/invite-caregiver') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk.toString());
    req.on('end', async () => {
      try {
        const { requesterId, email, relation, isCaregiverRole } = JSON.parse(bodyStr);
        if (!email || !requesterId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: "Email and requester ID are required" }));
        }

        const searchEmail = email.trim().toLowerCase();

        // 1. Find profile of the user being invited (caregiver or patient)
        const { data: targetProfile, error: profErr } = await defaultSupabase
          .from('profiles')
          .select('*')
          .ilike('email', searchEmail)
          .maybeSingle();

        if (profErr || !targetProfile) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: "No registered PillSync user found with that email address. Make sure they sign up first!" }));
        }

        if (targetProfile.id === requesterId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: "You cannot add yourself as a caregiver." }));
        }

        // 2. Fetch requester profile to include their name in notifications & emails
        const { data: requesterProfile } = await defaultSupabase
          .from('profiles')
          .select('*')
          .eq('id', requesterId)
          .maybeSingle();

        const requesterName = requesterProfile?.full_name || 'A PillSync User';

        // 3. Determine caregiver_id & patient_id
        const caregiverId = isCaregiverRole ? requesterId : targetProfile.id;
        const patientId = isCaregiverRole ? targetProfile.id : requesterId;
        const relTitle = relation || (isCaregiverRole ? 'Patient' : 'Caregiver');

        // 4. Check if connection already exists
        const { data: existingRel } = await defaultSupabase
          .from('caregiver_relations')
          .select('*')
          .eq('caregiver_id', caregiverId)
          .eq('patient_id', patientId)
          .maybeSingle();

        if (existingRel) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: `A caregiver connection with ${targetProfile.full_name || email} already exists.` }));
        }

        // 5. Insert connection with 'pending' status
        const { data: newRel, error: insertErr } = await defaultSupabase
          .from('caregiver_relations')
          .insert({
            caregiver_id: caregiverId,
            patient_id: patientId,
            relation: relTitle,
            status: 'pending',
          })
          .select()
          .single();

        if (insertErr) {
          console.error('[Caregiver Invite Insert Error]:', insertErr);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: insertErr.message }));
        }

        // 6. Insert notification for target profile
        await defaultSupabase.from('notifications').insert({
          user_id: targetProfile.id,
          type: 'caregiver',
          title: isCaregiverRole ? 'Caregiver monitoring request' : 'Caregiver invitation',
          message: `${requesterName} added you as their ${relTitle} on PillSync.`,
          read: false,
        });

        // 7. Send notification email via Nodemailer
        if (targetProfile.email) {
          const emailSubject = isCaregiverRole
            ? `PillSync: ${requesterName} wants to monitor your medications`
            : `PillSync Caregiver Invitation from ${requesterName}`;
          const inviteLine = isCaregiverRole
            ? `<p style="margin:0 0 16px;color:#0f172a;font-size:16px"><strong>${requesterName}</strong> (a caregiver) has requested to add you as their patient on PillSync.</p>`
            : `<p style="margin:0 0 16px;color:#0f172a;font-size:16px"><strong>${requesterName}</strong> has invited you as a caregiver on PillSync.</p>`;
          const emailBody = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
            <div style="max-width:560px;margin:0 auto;padding:24px">
              <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;text-align:center">
                <h1 style="margin:0;font-size:20px">PillSync Care Connection</h1>
              </div>
              <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px">
                <p style="margin:0 0 8px;color:#64748b;font-size:14px">Hi ${targetProfile.full_name || 'there'},</p>
                ${inviteLine}
                <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 20px;margin-bottom:20px">
                  <p style="margin:0;color:#0f766e;font-size:14px"><strong>Relationship:</strong> ${relTitle}</p>
                </div>
                <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5">Log in to your PillSync account to accept or decline this connection.</p>
              </div>
            </div></body></html>`;

          sendEmail(targetProfile.email, emailSubject, emailBody).catch((e) => console.error('[Invite Email Error]:', e.message));
        }

        console.log(`[Caregiver Invite Success] Connected ${requesterName} with ${targetProfile.email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, relation: newRel, targetProfile }));
      } catch (err) {
        console.error("[Invite Caregiver Error]:", err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 0. Register session token endpoint
  if (req.method === 'POST' && req.url === '/api/register-session') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk.toString());
    req.on('end', () => {
      try {
        const body = JSON.parse(bodyStr);
        if (body.access_token) {
          registerToken(body.access_token);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, registered_tokens: userTokens.size }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 1. Send Test Email Endpoint
  if (req.method === 'POST' && req.url === '/api/send-test-email') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk.toString());
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyStr);
        if (!body.email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: "Email is required" }));
        }

        const name = body.name || "PillSync User";
        const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
          <div style="max-width:560px;margin:0 auto;padding:24px">
            <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;text-align:center">
              <h1 style="margin:0;font-size:20px">PillSync Test Email</h1>
            </div>
            <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px">
              <p style="margin:0 0 8px;color:#64748b;font-size:14px">Hi ${name},</p>
              <p style="margin:0 0 20px;color:#0f172a;font-size:16px">Your PillSync email reminder system is configured correctly!</p>
            </div>
          </div></body></html>`;

        const responseData = await sendEmail(body.email, "PillSync Test Email", html);
        
        console.log(`[Test Email] Sent successfully to ${body.email}. MessageId: ${responseData.messageId}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, provider_response: responseData }));
      } catch (err) {
        console.error("[Test Email Error]:", err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 2. Send Test Daily Summary Endpoint
  if (req.method === 'POST' && req.url === '/api/send-test-summary') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk.toString());
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyStr);
        if (!body.email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: "Email is required" }));
        }

        const name = body.name || "PillSync User";
        const client = getSupabaseClient(reqToken);

        // Fetch actual user schedules if available
        let doses = [];
        const { data: profile } = await client.from("profiles").select("*").eq("email", body.email).maybeSingle();
        if (profile) {
          const { data: schedules } = await client
            .from("schedules")
            .select("times, medication:medications!inner(name, dosage, active)")
            .eq("user_id", profile.id)
            .eq("medication.active", true);

          if (schedules && schedules.length > 0) {
            for (const sched of schedules) {
              const med = Array.isArray(sched.medication) ? sched.medication[0] : sched.medication;
              for (const time of sched.times || []) {
                doses.push({ medName: med.name, dosage: med.dosage || "1 dose", time });
              }
            }
          }
        }

        if (doses.length === 0) {
          doses = [
            { medName: "Aspirin", dosage: "100mg", time: "08:00" },
            { medName: "Multivitamin", dosage: "1 tablet", time: "13:00" },
            { medName: "Omeprazole", dosage: "20mg", time: "20:00" }
          ];
        }

        const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        const html = summaryEmailHtml(name, doses, dateLabel);
        const responseData = await sendEmail(body.email, `Today's Medication Summary (${dateLabel})`, html);

        console.log(`[Test Summary] Sent successfully to ${body.email}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, provider_response: responseData }));
      } catch (err) {
        console.error("[Test Summary Error]:", err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 3. Trigger Scheduler Manual Endpoint
  if ((req.method === 'POST' || req.method === 'GET') && req.url === '/api/trigger-scheduler') {
    try {
      console.log('[Scheduler Trigger] Manual scheduler run requested...');
      const summary = await runScheduler(reqToken);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, summary }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  // 4. Send Test Reminder Endpoint
  if (req.method === 'POST' && req.url === '/api/send-test-reminder') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk.toString());
    req.on('end', async () => {
      try {
        const body = JSON.parse(bodyStr);
        if (!body.email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: "Email is required" }));
        }

        const name = body.name || "Test User";
        const medName = body.medicationName || "Aspirin";
        const dosage = body.dosage || "100mg";
        const time = body.time || "08:00";
        const instructions = body.instructions || "Take with water";

        const html = doseEmailHtml(name, medName, dosage, time, instructions);
        const responseData = await sendEmail(body.email, `Reminder: Take ${medName} at ${fmtTimeLabel(time)}`, html);
        
        console.log(`[Test Reminder] Sent successfully to ${body.email} for ${medName}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, provider_response: responseData }));
      } catch (err) {
        console.error("[Test Reminder Error]:", err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Send email between linked caregiver ↔ patient
  if (req.method === 'POST' && req.url === '/api/send-linked-email') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk.toString());
    req.on('end', async () => {
      try {
        const { senderId, recipientId, subject, message } = JSON.parse(bodyStr);
        if (!senderId || !recipientId || !subject || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'senderId, recipientId, subject, and message are required' }));
        }

        const [{ data: relA }, { data: relB }] = await Promise.all([
          defaultSupabase.from('caregiver_relations').select('*').eq('status', 'accepted').eq('caregiver_id', senderId).eq('patient_id', recipientId).maybeSingle(),
          defaultSupabase.from('caregiver_relations').select('*').eq('status', 'accepted').eq('caregiver_id', recipientId).eq('patient_id', senderId).maybeSingle(),
        ]);
        const relation = relA || relB;

        if (!relation) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'You can only email linked caregivers or patients.' }));
        }

        const [{ data: sender }, { data: recipient }] = await Promise.all([
          defaultSupabase.from('profiles').select('*').eq('id', senderId).maybeSingle(),
          defaultSupabase.from('profiles').select('*').eq('id', recipientId).maybeSingle(),
        ]);

        if (!recipient?.email) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Recipient has no email on file.' }));
        }

        const senderName = sender?.full_name || 'A PillSync user';
        const safeSubject = String(subject).slice(0, 120);
        const safeMessage = String(message).slice(0, 4000).replace(/\n/g, '<br/>');
        const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
          <div style="max-width:560px;margin:0 auto;padding:24px">
            <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;text-align:center">
              <h1 style="margin:0;font-size:20px">Message from ${senderName}</h1>
            </div>
            <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px">
              <p style="margin:0 0 8px;color:#64748b;font-size:14px">Hi ${recipient.full_name || 'there'},</p>
              <p style="margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6">${safeMessage}</p>
              <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">Sent via PillSync care network · Reply in the app or by email.</p>
            </div>
          </div></body></html>`;

        await sendEmail(recipient.email, `[PillSync] ${safeSubject}`, html);

        await defaultSupabase.from('notifications').insert({
          user_id: recipientId,
          type: 'caregiver',
          title: `Email from ${senderName}`,
          message: safeSubject,
          read: false,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('[Linked Email Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Update linked caregiver/patient profile (care contact fields)
  if (req.method === 'POST' && req.url === '/api/update-linked-profile') {
    let bodyStr = '';
    req.on('data', chunk => bodyStr += chunk.toString());
    req.on('end', async () => {
      try {
        const { requesterId, targetId, updates } = JSON.parse(bodyStr);
        if (!requesterId || !targetId || !updates || typeof updates !== 'object') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'requesterId, targetId, and updates are required' }));
        }

        const [{ data: relA }, { data: relB }] = await Promise.all([
          defaultSupabase.from('caregiver_relations').select('*').eq('status', 'accepted').eq('caregiver_id', requesterId).eq('patient_id', targetId).maybeSingle(),
          defaultSupabase.from('caregiver_relations').select('*').eq('status', 'accepted').eq('caregiver_id', targetId).eq('patient_id', requesterId).maybeSingle(),
        ]);
        const relation = relA || relB;

        if (!relation && requesterId !== targetId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Not allowed to update this profile.' }));
        }

        const allowed = {};
        if (typeof updates.full_name === 'string') allowed.full_name = updates.full_name.slice(0, 120);
        if (typeof updates.phone === 'string') allowed.phone = updates.phone.slice(0, 40);
        if (typeof updates.emergency_contact === 'string') allowed.emergency_contact = updates.emergency_contact.slice(0, 200);
        if (typeof updates.date_of_birth === 'string' || updates.date_of_birth === null) allowed.date_of_birth = updates.date_of_birth || null;
        if (typeof updates.timezone === 'string') allowed.timezone = updates.timezone.slice(0, 64);

        if (Object.keys(allowed).length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'No valid profile fields to update.' }));
        }

        const { data: updated, error: updErr } = await defaultSupabase
          .from('profiles')
          .update(allowed)
          .eq('id', targetId)
          .select()
          .single();

        if (updErr) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: updErr.message }));
        }

        if (requesterId !== targetId) {
          const { data: requester } = await defaultSupabase.from('profiles').select('full_name').eq('id', requesterId).maybeSingle();
          await defaultSupabase.from('notifications').insert({
            user_id: targetId,
            type: 'caregiver',
            title: 'Profile updated',
            message: `${requester?.full_name || 'Your care partner'} updated your care profile details.`,
            read: false,
          });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, profile: updated }));
      } catch (err) {
        console.error('[Update Linked Profile Error]:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(3002, () => {
  console.log('Email Backend running on http://localhost:3002');
  console.log('Scheduler started...');
  
  // Start the background scheduler running every 30 seconds
  setInterval(() => runScheduler(), 30000);
});

// --- SCHEDULER LOGIC ---
async function runScheduler(specificToken = null) {
  const summaryLog = { per_dose_sent: 0, daily_summary_sent: 0, caregiver_sent: 0, checked_users: 0 };
  
  try {
    // Collect all tokens to attempt querying (specificToken + stored tokens + default)
    const tokensToTry = [];
    if (specificToken) tokensToTry.push(specificToken);
    for (const t of userTokens.keys()) {
      if (!tokensToTry.includes(t)) tokensToTry.push(t);
    }
    if (tokensToTry.length === 0) tokensToTry.push(null); // default client

    for (const token of tokensToTry) {
      const client = getSupabaseClient(token);

      const { data: settings, error: setErr } = await client
        .from("reminder_settings")
        .select("*, profile:profiles!user_id(id, email, full_name, timezone, role)")
        .eq("email_reminders_enabled", true);

      if (setErr || !settings || settings.length === 0) {
        continue;
      }

      summaryLog.checked_users += settings.length;

      for (const s of settings) {
        const profile = Array.isArray(s.profile) ? s.profile[0] : s.profile;
        if (!profile || !profile.email) continue;

        const tz = profile.timezone || "UTC";
        const { localDateStr, localHHMM, localDow, year, month, day } = getTzDateTime(tz);

        // ==========================================
        // 1. PER-DOSE REMINDERS
        // ==========================================
        if (s.per_dose_reminders) {
          const { data: schedules, error: schedErr } = await client
            .from("schedules")
            .select("id, user_id, times, frequency, days_of_week, medication:medications!inner(id, name, dosage, form, instructions, active)")
            .eq("user_id", s.user_id)
            .eq("medication.active", true);

          if (!schedErr && schedules) {
            for (const sched of schedules) {
              if (sched.frequency === "specific_days" && !sched.days_of_week?.includes(localDow)) continue;

              for (const rawTime of sched.times || []) {
                const time = normalizeTime(rawTime);
                const [dH, dM] = time.split(":").map(Number);
                const doseMins = dH * 60 + dM;
                const offsetMinutes = s.reminder_offset_minutes || 0;
                
                let reminderMins = doseMins - offsetMinutes;
                let targetDoseDateStr = localDateStr;

                if (reminderMins < 0) {
                  reminderMins += 1440;
                  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
                  targetDoseDateStr = nextDay.toISOString().split("T")[0];
                }

                const rH = String(Math.floor(reminderMins / 60)).padStart(2, '0');
                const rM = String(reminderMins % 60).padStart(2, '0');
                const reminderHHMM = `${rH}:${rM}`;

                if (reminderHHMM !== localHHMM) continue;

                const med = Array.isArray(sched.medication) ? sched.medication[0] : sched.medication;
                if (!med || !med.id) continue;

                // Insert into deduplication log (email_reminders)
                const { error: dupErr } = await client
                  .from("email_reminders")
                  .insert({
                    user_id: s.user_id,
                    medication_id: med.id,
                    reminder_type: "per_dose",
                    dose_date: targetDoseDateStr,
                    dose_time: time,
                    recipient_email: profile.email,
                  });
                  
                if (dupErr) {
                   // Already sent for this exact dose date and time
                   continue;
                }

                // Send actual email
                try {
                  console.log(`[Scheduler Action] Sending per-dose reminder to ${profile.email} for ${med.name} at ${time}`);
                  await sendEmail(
                    profile.email,
                    `Reminder: Take ${med.name} at ${fmtTimeLabel(time)}`,
                    doseEmailHtml(profile.full_name || "there", med.name, med.dosage || "1 dose", time, med.instructions)
                  );
                  summaryLog.per_dose_sent++;
                } catch (err) {
                  console.error(`[Scheduler Failure] Per-dose email send failed for ${profile.email}:`, err.message);
                }
              }
            }
          }
        }

        // ==========================================
        // 2. DAILY SUMMARY REMINDERS
        // ==========================================
        if (s.daily_summary_enabled) {
          const summaryTime = normalizeTime(s.daily_summary_time || "08:00");
          
          if (summaryTime === localHHMM) {
            const { error: dupErr } = await client
              .from("email_reminders")
              .insert({
                user_id: s.user_id,
                medication_id: null,
                reminder_type: "daily_summary",
                dose_date: localDateStr,
                dose_time: null,
                recipient_email: profile.email,
              });

            if (!dupErr) {
              const { data: schedules } = await client
                .from("schedules")
                .select("times, frequency, days_of_week, medication:medications!inner(name, dosage, active)")
                .eq("user_id", s.user_id)
                .eq("medication.active", true);

              const doses = [];
              for (const sched of schedules || []) {
                if (sched.frequency === "specific_days" && !sched.days_of_week?.includes(localDow)) continue;
                const med = Array.isArray(sched.medication) ? sched.medication[0] : sched.medication;
                for (const rawTime of sched.times || []) {
                  doses.push({ medName: med.name, dosage: med.dosage || "1 dose", time: rawTime });
                }
              }

              if (doses.length > 0) {
                const dateLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
                try {
                  console.log(`[Scheduler Action] Sending daily summary to ${profile.email}`);
                  await sendEmail(
                    profile.email,
                    `Your medication summary for ${dateLabel}`,
                    summaryEmailHtml(profile.full_name || "there", doses, dateLabel)
                  );
                  summaryLog.daily_summary_sent++;
                } catch (err) {
                  console.error(`[Scheduler Failure] Daily summary send failed for ${profile.email}:`, err.message);
                }
              }
            }
          }
        }

        // ==========================================
        // 3. CAREGIVER COPIES
        // ==========================================
        if (s.notify_caregivers && profile.role === "patient" && s.per_dose_reminders) {
          const { data: caregivers } = await client
            .from("caregiver_relations")
            .select("caregiver:profiles!caregiver_id(id, email, full_name, timezone)")
            .eq("patient_id", s.user_id)
            .eq("status", "accepted");

          if (caregivers && caregivers.length > 0) {
            const { data: schedules } = await client
              .from("schedules")
              .select("id, user_id, times, frequency, days_of_week, medication:medications!inner(id, name, dosage, form, instructions, active)")
              .eq("user_id", s.user_id)
              .eq("medication.active", true);

            for (const cg of caregivers) {
              const cgProfile = Array.isArray(cg.caregiver) ? cg.caregiver[0] : cg.caregiver;
              if (!cgProfile?.email) continue;
              const cgTz = cgProfile.timezone || "UTC";
              const { localDateStr: cgDate, localHHMM: cgHHMM, localDow: cgDow } = getTzDateTime(cgTz);

              for (const sched of schedules || []) {
                if (sched.frequency === "specific_days" && !sched.days_of_week?.includes(cgDow)) continue;
                const med = Array.isArray(sched.medication) ? sched.medication[0] : sched.medication;

                for (const rawTime of sched.times || []) {
                  const time = normalizeTime(rawTime);
                  const [dH, dM] = time.split(":").map(Number);
                  const doseMins = dH * 60 + dM;
                  const offsetMinutes = s.reminder_offset_minutes || 0;
                  const reminderMins = doseMins - offsetMinutes;
                  const rH = String(Math.floor((reminderMins + 1440) % 1440 / 60)).padStart(2, '0');
                  const rM = String((reminderMins + 1440) % 60).padStart(2, '0');
                  
                  if (`${rH}:${rM}` !== cgHHMM) continue;

                  const { error: dupErr } = await client
                    .from("email_reminders")
                    .insert({
                      user_id: cgProfile.id,
                      medication_id: med.id,
                      reminder_type: "per_dose",
                      dose_date: cgDate,
                      dose_time: time,
                      recipient_email: cgProfile.email,
                    });

                  if (dupErr) continue;

                  try {
                    console.log(`[Scheduler Action] Sending caregiver copy to ${cgProfile.email} for ${profile.full_name}'s ${med.name}`);
                    await sendEmail(
                      cgProfile.email,
                      `Reminder: ${profile.full_name || "Your patient"} takes ${med.name} at ${fmtTimeLabel(time)}`,
                      doseEmailHtml(cgProfile.full_name || "there", `${med.name} (${profile.full_name || "patient"})`, med.dosage || "1 dose", time, med.instructions)
                    );
                    summaryLog.caregiver_sent++;
                  } catch (err) {
                    console.error(`[Scheduler Failure] Caregiver email send failed:`, err.message);
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[Scheduler Fatal Error]:", err);
  }

  return summaryLog;
}
