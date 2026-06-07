const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const configured = String(env.ALLOWED_ORIGIN || "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!configured.length) return origin || "*";
  return configured.includes(origin) ? origin : configured[0];
}

function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request, env),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Vary": "Origin"
  };
}

function jsonResponse(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function forwardToGitHub(request, env, url, defaults = {}) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, env, { error: "method_not_allowed" }, 405);
  }

  const payload = await request.json().catch(() => ({}));
  const clientId = payload.client_id || env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return jsonResponse(request, env, { error: "missing_client_id" }, 400);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "seufert-co-editor"
    },
    body: JSON.stringify({
      ...defaults,
      ...payload,
      client_id: clientId
    })
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      ...corsHeaders(request, env),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/device/code") {
      return forwardToGitHub(request, env, GITHUB_DEVICE_CODE_URL, { scope: "repo" });
    }

    if (pathname === "/access_token") {
      return forwardToGitHub(request, env, GITHUB_ACCESS_TOKEN_URL, {
        grant_type: "urn:ietf:params:oauth:grant-type:device_code"
      });
    }

    return jsonResponse(request, env, { ok: true, service: "seufert-co-github-oauth" });
  }
};
