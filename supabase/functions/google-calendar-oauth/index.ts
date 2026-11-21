import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.10.0";

const APP_ORIGIN = "https://itsvicwild.github.io";
const APP_RETURN_URL = "https://itsvicwild.github.io/planer/";
const REDIRECT_URI = "https://adsfjbrjgimgovtcjqvl.supabase.co/functions/v1/google-calendar-oauth";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.app.created",
].join(" ");

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });
}

function encodeHtmlText(value: string) {
  return Array.from(escapeHtml(value), (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint > 127 ? `&#${codePoint};` : character;
  }).join("");
}

function page(title: string, message: string, status = 200) {
  // Emit only ASCII bytes in the document. Numeric entities preserve Russian
  // text even if an intermediary mishandles the UTF-8 response encoding.
  const safeTitle = encodeHtmlText(title);
  const safeMessage = encodeHtmlText(message);
  const returnLabel = encodeHtmlText("Вернуться в Planer");
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{font:16px system-ui,sans-serif;background:#101713;color:#e2ebe5;min-height:100vh;display:grid;place-items:center;margin:0;padding:24px;box-sizing:border-box}.card{max-width:480px;background:#1b2620;border:1px solid #35463c;border-radius:24px;padding:28px}a{color:#9ce8c9}</style></head><body><main class="card"><h1>${safeTitle}</h1><p>${safeMessage}</p><p><a href="${APP_RETURN_URL}">${returnLabel}</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function base64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64url(bytes: Uint8Array) {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

function getGoogleConfig() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Google OAuth credentials are not configured");
  return { clientId, clientSecret };
}

async function encryptRefreshToken(token: string) {
  const encodedKey = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!encodedKey) throw new Error("Token encryption key is not configured");
  const keyBytes = fromBase64(encodedKey);
  if (keyBytes.length !== 32) throw new Error("Token encryption key must be 32 bytes (base64)");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return { ciphertext: base64(new Uint8Array(ciphertext)), iv: base64(iv) };
}

async function consumeState(admin: ReturnType<typeof getAdminClient>, rawState: string) {
  const stateHash = await sha256(rawState);
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("google_calendar_oauth_states")
    .update({ used_at: now })
    .eq("state_hash", stateHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("user_id")
    .maybeSingle();
  if (error) throw new Error("Could not validate OAuth state");
  if (!data?.user_id) throw new Error("OAuth state is invalid, expired, or already used");
  return data.user_id as string;
}

async function beginOAuth(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== APP_ORIGIN) return json({ error: "Origin not allowed" }, 403);

  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Authentication required" }, 401);

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(match[1]);
  if (userError || !userData.user) return json({ error: "Invalid Planer session" }, 401);

  const { clientId } = getGoogleConfig();
  const rawState = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const stateHash = await sha256(rawState);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: insertError } = await admin
    .from("google_calendar_oauth_states")
    .insert({ state_hash: stateHash, user_id: userData.user.id, expires_at: expiresAt });
  if (insertError) throw new Error("Could not create OAuth state");

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.searchParams.set("client_id", clientId);
  authorizationUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", GOOGLE_SCOPES);
  authorizationUrl.searchParams.set("access_type", "offline");
  authorizationUrl.searchParams.set("prompt", "consent");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");
  authorizationUrl.searchParams.set("state", rawState);

  return json({ authorization_url: authorizationUrl.toString() });
}


async function getOAuthStatus(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== APP_ORIGIN) return json({ error: "Origin not allowed" }, 403);

  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Authentication required" }, 401);

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(match[1]);
  if (userError || !userData.user) return json({ error: "Invalid Planer session" }, 401);

  const { data, error } = await admin
    .from("google_calendar_connections")
    .select("google_email, connected_at, last_synced_at, refresh_token_ciphertext, refresh_token_iv")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    console.error("Google Calendar status lookup failed");
    return json({ error: "Could not load Google Calendar status" }, 500);
  }

  const connected = !!(data?.refresh_token_ciphertext && data?.refresh_token_iv);
  return json({
    connected,
    google_email: connected ? data.google_email : null,
    connected_at: connected ? data.connected_at : null,
    last_synced_at: connected ? data.last_synced_at : null,
  });
}


async function decryptRefreshToken(ciphertext: string, encodedIv: string) {
  const encodedKey = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!encodedKey) throw new Error("Token encryption key is not configured");
  const keyBytes = fromBase64(encodedKey);
  if (keyBytes.length !== 32) throw new Error("Token encryption key must be 32 bytes (base64)");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(encodedIv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(clear);
}

async function disconnectGoogleCalendar(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== APP_ORIGIN) return json({ error: "Origin not allowed" }, 403);

  const authorization = req.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return json({ error: "Authentication required" }, 401);

  const admin = getAdminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(match[1]);
  if (userError || !userData.user) return json({ error: "Invalid Planer session" }, 401);

  const { data: connection, error: connectionError } = await admin
    .from("google_calendar_connections")
    .select("refresh_token_ciphertext, refresh_token_iv")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (connectionError) {
    console.error("Google Calendar disconnect lookup failed");
    return json({ error: "Could not load Google Calendar connection" }, 500);
  }
  if (!connection) return json({ disconnected: true, revoked: true });

  let revoked = false;
  if (connection.refresh_token_ciphertext && connection.refresh_token_iv) {
    try {
      const refreshToken = await decryptRefreshToken(
        connection.refresh_token_ciphertext,
        connection.refresh_token_iv,
      );
      const revokeResponse = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
      });
      revoked = revokeResponse.ok || revokeResponse.status === 400;
    } catch (error) {
      console.error("Google token revocation failed:", error instanceof Error ? error.message : "unknown error");
    }
  } else {
    revoked = true;
  }

  // Retain calendar_id and event mappings so reconnecting the same Google account
  // reuses the existing Planer calendar instead of creating a duplicate one.
  const { error: updateError } = await admin
    .from("google_calendar_connections")
    .update({
      refresh_token_ciphertext: null,
      refresh_token_iv: null,
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userData.user.id);

  if (updateError) {
    console.error("Google Calendar disconnect update failed");
    return json({ error: "Could not disconnect Google Calendar" }, 500);
  }

  return json({ disconnected: true, revoked });
}

async function finishOAuth(url: URL) {
  const rawState = url.searchParams.get("state");
  if (!rawState) return page("Не удалось подключить Google Calendar", "В запросе отсутствует защитный параметр. Вернись в Planer и начни подключение заново.", 400);

  const admin = getAdminClient();
  let userId: string;
  try {
    userId = await consumeState(admin, rawState);
  } catch {
    return page("Ссылка устарела", "Запрос на подключение уже использован или истёк. Вернись в Planer и начни подключение заново.", 400);
  }

  const googleError = url.searchParams.get("error");
  if (googleError) return page("Подключение отменено", "Google не завершил авторизацию. Можно вернуться в Planer и попробовать снова.", 400);

  const code = url.searchParams.get("code");
  if (!code) return page("Не удалось подключить Google Calendar", "Google не вернул код авторизации. Вернись в Planer и повтори попытку.", 400);

  try {
    const { clientId, clientSecret } = getGoogleConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const tokens = await tokenResponse.json();

    if (!tokens.id_token) throw new Error("Google identity token was not returned");
    const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
    const verified = await jwtVerify(tokens.id_token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    const googleSub = String(verified.payload.sub ?? "");
    const googleEmail = String(verified.payload.email ?? "");
    if (!googleSub || !googleEmail || verified.payload.email_verified !== true) {
      throw new Error("Google account identity could not be verified");
    }

    const { data: existing, error: existingError } = await admin
      .from("google_calendar_connections")
      .select("google_sub, calendar_id, refresh_token_ciphertext, refresh_token_iv")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingError) throw new Error("Could not read existing Google connection");

    let encrypted = null;
    if (tokens.refresh_token) {
      encrypted = await encryptRefreshToken(tokens.refresh_token);
    } else if (existing?.google_sub === googleSub && existing.refresh_token_ciphertext && existing.refresh_token_iv) {
      encrypted = {
        ciphertext: existing.refresh_token_ciphertext,
        iv: existing.refresh_token_iv,
      };
    } else {
      throw new Error("Google did not return an offline refresh token");
    }

    let calendarId = existing?.google_sub === googleSub ? existing.calendar_id : null;
    if (!calendarId) {
      const calendarResponse = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summary: "Planer" }),
      });
      if (!calendarResponse.ok) {
        const responseText = await calendarResponse.text();
        let responseBody: { error?: { status?: string; message?: string; errors?: Array<{ reason?: string }> } } = {};
        try { responseBody = JSON.parse(responseText); } catch { /* keep the HTTP status as the diagnostic */ }
        const googleError = responseBody.error;
        const googleReason = String(googleError?.status ?? googleError?.errors?.[0]?.reason ?? "UNKNOWN").slice(0, 100);
        const googleMessage = String(googleError?.message ?? "Google Calendar API did not provide an error description").slice(0, 500);
        console.error("Google Calendar calendar creation failed:", JSON.stringify({
          http_status: calendarResponse.status,
          error_reason: googleReason,
          error_message: googleMessage,
        }));
        const hint = calendarResponse.status === 403
          ? "Проверь, что Google Calendar API включён именно в том Google Cloud проекте, которому принадлежит этот OAuth Client."
          : "Проверь настройки Google Calendar API и повтори подключение.";
        return page(
          "Не удалось создать календарь Planer",
          `Google Calendar API вернул HTTP ${calendarResponse.status} (${googleReason}). ${googleMessage}. ${hint}`,
          200,
        );
      }
      const calendar = await calendarResponse.json();
      calendarId = calendar.id;
      if (!calendarId) throw new Error("Google did not return a calendar ID");
    }

    const now = new Date().toISOString();
    const { error: saveError } = await admin
      .from("google_calendar_connections")
      .upsert({
        user_id: userId,
        google_sub: googleSub,
        google_email: googleEmail,
        calendar_id: calendarId,
        refresh_token_ciphertext: encrypted.ciphertext,
        refresh_token_iv: encrypted.iv,
        connected_at: now,
        updated_at: now,
        last_sync_error: null,
      }, { onConflict: "user_id" });
    if (saveError) throw new Error("Could not save the Google connection");

    return page("Google Calendar подключён", "Аккаунт Google успешно связан с Planer. Для дальнейшей синхронизации понадобится завершить настройку интеграции в самом приложении.");
  } catch (error) {
    console.error("Google Calendar OAuth callback failed:", error instanceof Error ? error.message : "unknown error");
    return page("Не удалось подключить Google Calendar", "Возникла ошибка при настройке календаря. Проверь настройки подключения и попробуй снова.", 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("origin") !== APP_ORIGIN) return new Response("Origin not allowed", { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error") || url.searchParams.has("state"))) {
    return await finishOAuth(url);
  }

  if (req.method === "POST") {
    try {
      const body = await req.json().catch(() => ({}));
      if (body?.action === "start") return await beginOAuth(req);
      if (body?.action === "status") return await getOAuthStatus(req);
      if (body?.action === "disconnect") return await disconnectGoogleCalendar(req);
      return json({ error: "Unsupported action" }, 400);
    } catch (error) {
      console.error("Google Calendar OAuth start failed:", error instanceof Error ? error.message : "unknown error");
      return json({ error: "Could not start Google authorization" }, 500);
    }
  }

  if (req.method === "GET") {
    return json({ ok: true, service: "google-calendar-oauth", ready: true });
  }

  return json({ error: "Method not allowed" }, 405, { "Allow": "GET, POST, OPTIONS" });
});
