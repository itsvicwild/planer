import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://itsvicwild.github.io";
const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let secretKey = legacyKey;
  if (!secretKey) {
    const keysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
    if (keysJson) {
      try { secretKey = JSON.parse(keysJson).default; } catch { /* handled below */ }
    }
  }
  if (!url || !secretKey) throw new Error("Supabase server configuration is missing");
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function decryptRefreshToken(ciphertext: string, encodedIv: string) {
  const encodedKey = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!encodedKey) throw new Error("Google token encryption key is not configured");
  const keyBytes = base64ToBytes(encodedKey);
  if (keyBytes.length !== 32) throw new Error("Google token encryption key must be 32 bytes");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encodedIv) },
    key,
    base64ToBytes(ciphertext),
  );
  return new TextDecoder().decode(clear);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTime(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function addDays(date: string, amount: number) {
  const value = new Date(date + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dateParts(date: string) {
  return date.replace(/-/g, "");
}

function weekdayCode(date: string) {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day];
}

function zonedDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    const next = target - (represented - guess);
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

function recurrenceLines(event: PlannerEvent, timeZone: string) {
  if (event.rec === "none") return [];
  const frequencies: Record<string, string> = {
    day: "DAILY",
    week: "WEEKLY",
    biweek: "WEEKLY",
    month: "MONTHLY",
    year: "YEARLY",
  };
  const frequency = frequencies[event.rec];
  if (!frequency) return [];
  const rule = ["FREQ=" + frequency];
  if (event.rec === "biweek") rule.push("INTERVAL=2");
  if (event.rec === "week" || event.rec === "biweek") {
    const days = event.wd.length ? event.wd : [((new Date(event.date + "T00:00:00Z").getUTCDay() + 6) % 7) + 1];
    const byDay = [...new Set(days)].sort((a, b) => a - b).map((day) => ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][day - 1]);
    if (byDay.length) rule.push("BYDAY=" + byDay.join(","));
  }
  if (event.until) {
    if (event.allDay) {
      rule.push("UNTIL=" + dateParts(event.until));
    } else {
      const untilUtc = zonedDateTimeToUtc(event.until, "23:59", timeZone)
        .toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
      rule.push("UNTIL=" + untilUtc);
    }
  }
  const lines = ["RRULE:" + rule.join(";")];
  const exceptions = [...new Set(event.ex.filter(validDate))].sort();
  if (exceptions.length) {
    const values = exceptions.map((date) => event.allDay
      ? dateParts(date)
      : dateParts(date) + "T" + event.a.replace(":", "") + "00");
    lines.push(event.allDay
      ? "EXDATE;VALUE=DATE:" + values.join(",")
      : "EXDATE;TZID=" + timeZone + ":" + values.join(","));
  }
  return lines;
}

interface PlannerEvent {
  id: string;
  t: string;
  date: string;
  endDate: string;
  a: string;
  z: string;
  allDay: boolean;
  k: string;
  rec: string;
  wd: number[];
  until: string;
  ex: string[];
  p: string;
  desc: string;
}

function sanitizePlannerEvent(raw: unknown): PlannerEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.demo === true) return null;
  const id = String(value.id ?? "").trim();
  const date = validDate(value.date) ? value.date : "";
  if (!id || id.length > 128 || !date) return null;
  const endDate = validDate(value.endDate) && value.endDate >= date ? value.endDate : date;
  const allDay = value.allDay === true || value.k === "holiday";
  const a = allDay ? "00:00" : (validTime(value.a) ? value.a : "10:00");
  let z = allDay ? "23:59" : (validTime(value.z) ? value.z : "11:00");
  if (!allDay && endDate === date && z <= a) z = "23:59";
  const recurrence = ["none", "day", "week", "biweek", "month", "year"].includes(String(value.rec))
    ? String(value.rec) : "none";
  const wd = Array.isArray(value.wd)
    ? [...new Set(value.wd.map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))]
    : [];
  const until = validDate(value.until) && value.until >= date ? value.until : "";
  const ex = Array.isArray(value.ex) ? value.ex.filter(validDate).slice(0, 500) : [];
  return {
    id,
    t: String(value.t ?? "Без названия").trim().slice(0, 240) || "Без названия",
    date,
    endDate: (new Date(endDate + "T00:00:00Z").getTime() - new Date(date + "T00:00:00Z").getTime()) / 86400000 <= 366 ? endDate : date,
    a,
    z,
    allDay,
    k: String(value.k ?? "work"),
    rec: recurrence,
    wd,
    until,
    ex,
    p: String(value.p ?? "").slice(0, 240),
    desc: String(value.desc ?? "").slice(0, 20000),
  };
}

function googleEventBody(event: PlannerEvent, timeZone: string) {
  const endDateExclusive = addDays(event.endDate, 1);
  const body: Record<string, unknown> = {
    summary: event.t,
    location: event.p || undefined,
    description: event.desc || undefined,
    extendedProperties: {
      private: { planerEventId: event.id, planerSyncVersion: "1" },
    },
  };
  if (event.allDay) {
    body.start = { date: event.date };
    body.end = { date: endDateExclusive };
  } else {
    body.start = { dateTime: event.date + "T" + event.a + ":00", timeZone };
    body.end = { dateTime: event.endDate + "T" + event.z + ":00", timeZone };
  }
  const recurrence = recurrenceLines(event, timeZone);
  if (recurrence.length) body.recurrence = recurrence;
  return body;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deterministicGoogleEventId(userId: string, plannerEventId: string) {
  // Google accepts lowercase base32hex event IDs. Hex is a valid subset.
  return (await sha256Hex(userId + ":" + plannerEventId)).slice(0, 40);
}

class GoogleApiError extends Error {
  status: number;
  reason: string;
  constructor(status: number, reason: string, message: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

async function googleRequest(
  accessToken: string,
  calendarId: string,
  method: string,
  eventId?: string,
  body?: Record<string, unknown>,
) {
  const url = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/" +
    encodeURIComponent(calendarId) + "/events" +
    (eventId ? "/" + encodeURIComponent(eventId) : ""),
  );
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "Authorization": "Bearer " + accessToken,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error("Не удалось связаться с Google Calendar API");
  }
  if (response.status === 204 || response.status === 200) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const text = await response.text();
  let parsed: { error?: { status?: string; message?: string; errors?: Array<{ reason?: string }> } } = {};
  try { parsed = JSON.parse(text); } catch { /* use HTTP status */ }
  const reason = String(parsed.error?.status ?? parsed.error?.errors?.[0]?.reason ?? "UNKNOWN").slice(0, 100);
  const message = String(parsed.error?.message ?? "Google Calendar API request failed").slice(0, 350);
  throw new GoogleApiError(response.status, reason, message);
}

async function refreshGoogleAccessToken(refreshToken: string) {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials are not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const reason = String(body.error ?? "token_refresh_failed");
    throw new Error("Google token refresh failed (" + reason + ")");
  }
  return String(body.access_token);
}

function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

async function syncCalendar(req: Request) {
  if (req.headers.get("origin") !== APP_ORIGIN) return json({ error: "Origin not allowed" }, 403);
  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Authentication required" }, 401);

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(match[1]);
  if (userError || !userData.user) return json({ error: "Invalid Planer session" }, 401);
  const userId = userData.user.id;

  const body = await req.json().catch(() => ({}));
  const requestedZone = validTimeZone(body?.timeZone) ? body.timeZone : "";
  const { data: connectionExists, error: existenceError } = await admin
    .from("google_calendar_connections")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existenceError) return json({ error: "Could not check Google Calendar connection" }, 500);
  if (!connectionExists) return json({ ok: true, skipped: true, reason: "not_connected" });

  const now = new Date().toISOString();
  const lockToken = crypto.randomUUID();
  const lockUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { data: locked, error: lockError } = await admin
    .from("google_calendar_connections")
    .update({ sync_lock_token: lockToken, sync_lock_until: lockUntil, updated_at: now })
    .eq("user_id", userId)
    .or("sync_lock_until.is.null,sync_lock_until.lt." + now)
    .select("user_id")
    .maybeSingle();

  if (lockError) {
    console.error("Google Calendar sync lock failed:", lockError.message);
    return json({ error: "Could not acquire sync lock" }, 500);
  }
  if (!locked) return json({ ok: true, skipped: true, reason: "sync_in_progress" }, 202);

  try {
    const { data: connection, error: connectionError } = await admin
      .from("google_calendar_connections")
      .select("calendar_id, google_email, refresh_token_ciphertext, refresh_token_iv, time_zone")
      .eq("user_id", userId)
      .maybeSingle();

    if (connectionError || !connection?.calendar_id || !connection.refresh_token_ciphertext || !connection.refresh_token_iv) {
      throw new Error("Google Calendar is not connected or its token is unavailable");
    }

    const timeZone = requestedZone || (validTimeZone(connection.time_zone) ? connection.time_zone : "Europe/Amsterdam");

    const { data: workspace, error: workspaceError } = await admin
      .from("workspace_data")
      .select("payload, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (workspaceError || !workspace?.payload || typeof workspace.payload !== "object") {
      throw new Error("Could not load Planer cloud data");
    }

    const payload = workspace.payload as Record<string, unknown>;
    const rawEvents = Array.isArray(payload.E) ? payload.E : [];
    const events = rawEvents.map(sanitizePlannerEvent).filter((event): event is PlannerEvent => !!event);
    const desiredIds = new Set(events.map((event) => event.id));

    const { data: mappedRows, error: mapError } = await admin
      .from("google_calendar_event_map")
      .select("planner_event_id, google_event_id, fingerprint")
      .eq("user_id", userId);
    if (mapError) throw new Error("Could not load Google Calendar event mappings");

    const mapping = new Map((mappedRows ?? []).map((row: any) => [
      String(row.planner_event_id),
      { googleEventId: String(row.google_event_id), fingerprint: String(row.fingerprint) },
    ]));

    const pendingEvents = [];
    for (const event of events) {
      const resource = googleEventBody(event, timeZone);
      const fingerprint = await sha256Hex(JSON.stringify(resource));
      const existing = mapping.get(event.id);
      if (existing?.fingerprint === fingerprint) continue;
      const googleId = existing?.googleEventId || await deterministicGoogleEventId(userId, event.id);
      pendingEvents.push({ event, resource, fingerprint, googleId, existing });
    }
    const staleMappings = [...mapping.entries()].filter(([plannerId]) => !desiredIds.has(plannerId));

    let created = 0;
    let updated = 0;
    let unchanged = events.length - pendingEvents.length;
    let deleted = 0;

    // Avoid refreshing the Google token for task/settings saves that did not change events.
    if (!pendingEvents.length && !staleMappings.length) {
      const syncedAt = new Date().toISOString();
      const { error: noopFinishError } = await admin
        .from("google_calendar_connections")
        .update({
          last_synced_at: syncedAt,
          last_sync_error: null,
          time_zone: timeZone,
          updated_at: syncedAt,
        })
        .eq("user_id", userId)
        .eq("sync_lock_token", lockToken);
      if (noopFinishError) throw new Error("Could not save Google Calendar sync status");
      return json({ ok: true, created, updated, unchanged, deleted, last_synced_at: syncedAt });
    }

    const refreshToken = await decryptRefreshToken(
      connection.refresh_token_ciphertext,
      connection.refresh_token_iv,
    );
    const accessToken = await refreshGoogleAccessToken(refreshToken);

    for (const pending of pendingEvents) {
      const { event, resource, fingerprint, googleId, existing } = pending;
      try {
        if (existing) {
          try {
            await googleRequest(accessToken, connection.calendar_id, "PUT", googleId, { ...resource, id: googleId });
            updated++;
          } catch (error) {
            if (!(error instanceof GoogleApiError) || error.status !== 404) throw error;
            await googleRequest(accessToken, connection.calendar_id, "POST", undefined, { ...resource, id: googleId });
            created++;
          }
        } else {
          try {
            await googleRequest(accessToken, connection.calendar_id, "POST", undefined, { ...resource, id: googleId });
            created++;
          } catch (error) {
            // A previous attempt may have inserted the deterministic ID before its DB mapping was saved.
            if (!(error instanceof GoogleApiError) || error.status !== 409) throw error;
            await googleRequest(accessToken, connection.calendar_id, "PUT", googleId, { ...resource, id: googleId });
            updated++;
          }
        }
      } catch (error) {
        if (error instanceof GoogleApiError) {
          throw new Error("Google Calendar event sync failed (" + error.status + ", " + error.reason + "): " + error.message);
        }
        throw error;
      }

      const { error: saveMapError } = await admin
        .from("google_calendar_event_map")
        .upsert({
          user_id: userId,
          planner_event_id: event.id,
          google_event_id: googleId,
          fingerprint,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,planner_event_id" });
      if (saveMapError) throw new Error("Google event was created but its mapping could not be saved");
    }

    // Only mapped events absent from the authoritative Planer E array are removed.
    // Tasks, deadlines, holidays outside E, and Google-created events are untouched.
    for (const [plannerId, mapped] of staleMappings) {
      try {
        await googleRequest(accessToken, connection.calendar_id, "DELETE", mapped.googleEventId);
      } catch (error) {
        if (!(error instanceof GoogleApiError) || error.status !== 404) {
          throw error instanceof GoogleApiError
            ? new Error("Google Calendar event deletion failed (" + error.status + ", " + error.reason + "): " + error.message)
            : error;
        }
      }
      const { error: deleteMapError } = await admin
        .from("google_calendar_event_map")
        .delete()
        .eq("user_id", userId)
        .eq("planner_event_id", plannerId);
      if (deleteMapError) throw new Error("Google event was removed but its mapping could not be deleted");
      deleted++;
    }

    const syncedAt = new Date().toISOString();
    const { error: finishError } = await admin
      .from("google_calendar_connections")
      .update({
        last_synced_at: syncedAt,
        last_sync_error: null,
        time_zone: timeZone,
        updated_at: syncedAt,
      })
      .eq("user_id", userId)
      .eq("sync_lock_token", lockToken);
    if (finishError) throw new Error("Could not save Google Calendar sync status");

    return json({
      ok: true,
      created,
      updated,
      unchanged,
      deleted,
      last_synced_at: syncedAt,
    });
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Google Calendar sync failed").slice(0, 900);
    console.error("Google Calendar sync failed:", message);
    await admin.from("google_calendar_connections")
      .update({ last_sync_error: message, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("sync_lock_token", lockToken);
    return json({ error: message }, 502);
  } finally {
    await admin.from("google_calendar_connections")
      .update({ sync_lock_token: null, sync_lock_until: null })
      .eq("user_id", userId)
      .eq("sync_lock_token", lockToken);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") !== APP_ORIGIN) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    return await syncCalendar(req);
  } catch (error) {
    console.error("Google Calendar sync request failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "Could not synchronize Google Calendar" }, 500);
  }
});
