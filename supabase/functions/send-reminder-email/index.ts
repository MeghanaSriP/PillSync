import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("REMINDER_FROM_EMAIL") || "onboarding@resend.dev";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  timezone: string;
  role: string;
};

type Setting = {
  user_id: string;
  email_reminders_enabled: boolean;
  per_dose_reminders: boolean;
  reminder_offset_minutes: number;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  notify_caregivers: boolean;
};

type ScheduleRow = {
  id: string;
  user_id: string;
  times: string[];
  frequency: string;
  days_of_week: number[];
  medication: {
    id: string;
    name: string;
    dosage: string | null;
    form: string | null;
    instructions: string | null;
    active: boolean;
  };
};

function tzNow(tz: string): Date {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => s.find((p) => p.type === t)?.value ?? "0";
    return new Date(`${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`);
  } catch {
    return new Date();
  }
}

function fmtTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, "0")} ${ampm}`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email send to", to);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: `PillSync <${FROM_EMAIL}>`, to: [to], subject, html }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`Resend error ${res.status} for ${to}:`, txt);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Resend fetch failed:", err?.message || err);
    return false;
  }
}

function doseEmailHtml(name: string, medName: string, dosage: string, time: string, instructions: string | null): string {
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

function summaryEmailHtml(name: string, doses: { medName: string; dosage: string; time: string }[], dateLabel: string): string {
  const rows = doses
    .sort((a, b) => a.time.localeCompare(b.time))
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body.type === "test") {
      const email = body.email;
      const name = body.name || "Test User";
      if (!email) {
        return new Response(JSON.stringify({ error: "email is required for test" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const ok = await sendEmail(
        email,
        "PillSync Test Email",
        `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
        <div style="max-width:560px;margin:0 auto;padding:24px">
          <div style="background:#0d9488;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;text-align:center">
            <h1 style="margin:0;font-size:20px">PillSync Test Email</h1>
          </div>
          <div style="background:#fff;padding:28px 24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 16px 16px">
            <p style="margin:0 0 8px;color:#64748b;font-size:14px">Hi ${name},</p>
            <p style="margin:0 0 20px;color:#0f172a;font-size:16px">Your PillSync email reminder system is configured correctly!</p>
            <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;padding:16px 20px;margin-bottom:20px">
              <p style="margin:0;color:#334155;font-size:14px">If you received this email, the connection between your Supabase Edge Function and Resend is active.</p>
            </div>
          </div>
        </div></body></html>`
      );
      return new Response(JSON.stringify({ success: ok }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: settings } = await supabase
      .from("reminder_settings")
      .select("*, profile:profiles!user_id(id, email, full_name, timezone, role)")
      .eq("email_reminders_enabled", true);

    if (!settings || settings.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no_enabled_settings" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sentCount = 0;
    const now = new Date();

    for (const s of settings as unknown as (Setting & { profile: Profile })[]) {
      const profile = Array.isArray(s.profile) ? s.profile[0] : s.profile;
      if (!profile || !profile.email) continue;

      const tz = profile.timezone || "UTC";
      const localNow = tzNow(tz);
      const localDateStr = localNow.toISOString().split("T")[0];
      const localDow = localNow.getDay();
      const localHHMM = localNow.toTimeString().slice(0, 5);

      // ---- Per-dose reminders ----
      if (s.per_dose_reminders) {
        const { data: schedules } = await supabase
          .from("schedules")
          .select("id, user_id, times, frequency, days_of_week, medication:medications!inner(id, name, dosage, form, instructions, active)")
          .eq("user_id", s.user_id)
          .eq("medication.active", true);

        for (const sched of (schedules as unknown as ScheduleRow[]) || []) {
          if (sched.frequency === "specific_days" && !sched.days_of_week?.includes(localDow)) continue;

          for (const time of sched.times) {
            const doseLocal = new Date(`${localDateStr}T${time}:00`);
            const offsetMs = s.reminder_offset_minutes * 60 * 1000;
            const reminderLocal = new Date(doseLocal.getTime() - offsetMs);
            const reminderHHMM = reminderLocal.toTimeString().slice(0, 5);

            if (reminderHHMM !== localHHMM) continue;
            if (reminderLocal > doseLocal) continue;

            const { error: dupErr } = await supabase
              .from("email_reminders")
              .insert({
                user_id: s.user_id,
                medication_id: sched.medication.id,
                reminder_type: "per_dose",
                dose_date: localDateStr,
                dose_time: time,
                recipient_email: profile.email,
              });
            if (dupErr) continue; // already sent for this dose

            const med = sched.medication;
            const ok = await sendEmail(
              profile.email,
              `Reminder: Take ${med.name} at ${fmtTimeLabel(time)}`,
              doseEmailHtml(profile.full_name || "there", med.name, med.dosage || "1 dose", time, med.instructions)
            );
            if (ok) sentCount++;
          }
        }

        // ---- Caregiver copies for patients who opted in ----
        if (s.notify_caregivers && profile.role === "patient") {
          const { data: caregivers } = await supabase
            .from("caregiver_relations")
            .select("caregiver:profiles!caregiver_id(id, email, full_name, timezone)")
            .eq("patient_id", s.user_id)
            .eq("status", "accepted");

          const { data: schedules } = await supabase
            .from("schedules")
            .select("id, user_id, times, frequency, days_of_week, medication:medications!inner(id, name, dosage, form, instructions, active)")
            .eq("user_id", s.user_id)
            .eq("medication.active", true);

          for (const cg of (caregivers as unknown as { caregiver: Profile }[]) || []) {
            const cgProfile = Array.isArray(cg.caregiver) ? cg.caregiver[0] : cg.caregiver;
            if (!cgProfile?.email) continue;
            const cgTz = cgProfile.timezone || "UTC";
            const cgNow = tzNow(cgTz);
            const cgDate = cgNow.toISOString().split("T")[0];
            const cgDow = cgNow.getDay();
            const cgHHMM = cgNow.toTimeString().slice(0, 5);

            for (const sched of (schedules as unknown as ScheduleRow[]) || []) {
              if (sched.frequency === "specific_days" && !sched.days_of_week?.includes(cgDow)) continue;
              for (const time of sched.times) {
                const doseLocal = new Date(`${cgDate}T${time}:00`);
                const reminderLocal = new Date(doseLocal.getTime() - s.reminder_offset_minutes * 60 * 1000);
                if (reminderLocal.toTimeString().slice(0, 5) !== cgHHMM) continue;
                if (reminderLocal > doseLocal) continue;

                const { error: dupErr } = await supabase
                  .from("email_reminders")
                  .insert({
                    user_id: cgProfile.id,
                    medication_id: sched.medication.id,
                    reminder_type: "per_dose",
                    dose_date: cgDate,
                    dose_time: time,
                    recipient_email: cgProfile.email,
                  });
                if (dupErr) continue;

                const med = sched.medication;
                const ok = await sendEmail(
                  cgProfile.email,
                  `Reminder: ${profile.full_name || "Your patient"} takes ${med.name} at ${fmtTimeLabel(time)}`,
                  doseEmailHtml(cgProfile.full_name || "there", `${med.name} (${profile.full_name || "patient"})`, med.dosage || "1 dose", time, med.instructions)
                );
                if (ok) sentCount++;
              }
            }
          }
        }
      }

      // ---- Daily summary ----
      if (s.daily_summary_enabled && s.daily_summary_time.slice(0, 5) === localHHMM) {
        const { error: dupErr } = await supabase
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
          const { data: schedules } = await supabase
            .from("schedules")
            .select("times, frequency, days_of_week, medication:medications!inner(name, dosage, active)")
            .eq("user_id", s.user_id)
            .eq("medication.active", true);

          const doses: { medName: string; dosage: string; time: string }[] = [];
          for (const sched of (schedules as unknown as ScheduleRow[]) || []) {
            if (sched.frequency === "specific_days" && !sched.days_of_week?.includes(localDow)) continue;
            for (const time of sched.times) {
              doses.push({ medName: sched.medication.name, dosage: sched.medication.dosage || "1 dose", time });
            }
          }
          if (doses.length > 0) {
            const dateLabel = localNow.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
            const ok = await sendEmail(
              profile.email,
              `Your medication summary for ${dateLabel}`,
              summaryEmailHtml(profile.full_name || "there", doses, dateLabel)
            );
            if (ok) sentCount++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ sent: sentCount, ts: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Reminder dispatcher error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
