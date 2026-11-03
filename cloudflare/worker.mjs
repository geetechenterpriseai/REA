// FXGA REA Cloud MCP gateway (no arbitrary commands or target uploads).
// The worker is fail-closed unless MCP_AUTH_TOKEN is set in Cloudflare Secrets.
// It implements a stateless JSON-RPC MCP Streamable HTTP subset over POST /mcp.

const REPO = "geetechenterpriseai/REA";
const WORKFLOW_ID = "rea-ghidra-demo.yml";
const WORKFLOW_NAME = "REA - Ghidra Cloud Demo";
const VERSION = "0.1.0";

function responseJson(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}
function fail(message, status) { return responseJson({ error: message }, status); }
function validRunId(n) {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isSafeInteger(v) && v > 0 && v < 100000000000000 ? v : null;
}
function safeRun(run) {
  return {
    id: run.id, name: run.name, status: run.status,
    conclusion: run.conclusion, event: run.event,
    created_at: run.created_at, updated_at: run.updated_at,
    url: run.html_url, branch: run.head_branch,
  };
}
async function equalsSecret(provided, expected) {
  if (!expected || typeof provided !== "string") return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const aa = new Uint8Array(a), bb = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function bearerOK(request, secret) {
  const value = request.headers.get("Authorization") || "";
  if (!value.startsWith("Bearer ") || value.length > 1024) return false;
  return equalsSecret(value.slice(7), secret);
}
function authDenied() {
  return fail("Unauthorized", 401);
}
async function github(path, env, opts = {}) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "FXGA-REA-Cloud-MCP",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) headers["Authorization"] = "Bearer " + env.GITHUB_TOKEN;
  const res = await fetch("https://api.github.com/repos/" + REPO + path, {
    method: opts.method || "GET",
    headers: { ...headers, ...(opts.body ? { "Content-Type": "application/json" } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 204) return { accepted: true };
  if (!res.ok) {
    const allowedError = res.status === 401 || res.status === 403 || res.status === 404 || res.status === 429
      ? "GitHub returned HTTP " + res.status + " (verify repository permissions or rate limits)"
      : "GitHub returned HTTP " + res.status;
    throw new Error(allowedError);
  }
  return res.json();
}
function inputNumber(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error("Integer must be between " + min + " and " + max);
  return value;
}
function requireRunId(value) {
  const n = validRunId(value);
  if (!n) throw new Error("Invalid run_id");
  return n;
}
const baseTools = [
  {
    name: "rea_list_runs",
    description: "List recent REA GitHub Actions cloud job statuses (read-only).",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 10, default: 5 } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "rea_get_run",
    description: "Get status, conclusion, and bounded step details for a known GitHub Actions run ID (read-only).",
    inputSchema: { type: "object", properties: { run_id: { type: "integer", minimum: 1 } }, required: ["run_id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "rea_list_artifacts",
    description: "List report archive metadata for a known run. GitHub may require signing in to download archives.",
    inputSchema: { type: "object", properties: { run_id: { type: "integer", minimum: 1 } }, required: ["run_id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "rea_get_report",
    description: "Read bounded sanitized demo analysis report sent to Cloudflare KV by a verified GitHub Actions run.",
    inputSchema: { type: "object", properties: { run_id: { type: "integer", minimum: 1 } }, required: ["run_id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];
const dispatchTool = {
  name: "rea_start_ghidra_demo",
  description: "Start the preconfigured harmless native-binary demo workflow. Incurs GitHub Actions minutes. Cannot execute user commands or private binaries. Only call when user explicitly asks to start a demo run.",
  inputSchema: { type: "object", properties: { confirmation: { type: "string", enum: ["RUN GHIDRA DEMO"] } }, required: ["confirmation"], additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
};
function availableTools(env) {
  return env.ENABLE_DISPATCH === "true" && env.GITHUB_TOKEN && env.RESULTS
    ? [...baseTools, dispatchTool] : baseTools;
}
async function callTool(name, args, env) {
  args = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  if (name === "rea_list_runs") {
    const limit = inputNumber(args.limit, 5, 1, 10);
    const data = await github("/actions/runs?per_page=" + limit, env);
    return { repository: REPO, runs: (data.workflow_runs || []).slice(0, limit).map(safeRun) };
  }
  if (name === "rea_get_run") {
    const id = requireRunId(args.run_id);
    const run = await github("/actions/runs/" + id, env);
    if (run.name !== WORKFLOW_NAME && run.name !== "REA - Install and Verify") {
      throw new Error("Run is outside the allowlisted REA workflows");
    }
    const jobs = await github("/actions/runs/" + id + "/jobs?per_page=10", env);
    return {
      repository: REPO, run: safeRun(run),
      jobs: (jobs.jobs || []).slice(0, 10).map(j => ({
        name: j.name, status: j.status, conclusion: j.conclusion,
        steps: (j.steps || []).slice(0, 20).map(s => ({
          name: s.name, status: s.status, conclusion: s.conclusion,
        })),
      })),
    };
  }
  if (name === "rea_list_artifacts") {
    const id = requireRunId(args.run_id);
    const run = await github("/actions/runs/" + id, env);
    if (run.name !== WORKFLOW_NAME) throw new Error("Only demo reports are supported");
    const data = await github("/actions/runs/" + id + "/artifacts?per_page=10", env);
    return {
      run_id: id, artifacts: (data.artifacts || []).slice(0, 10).map(a => ({
        name: a.name, size_in_bytes: a.size_in_bytes,
        expires_at: a.expires_at, expired: a.expired,
        github_run_url: run.html_url,
      })),
    };
  }
  if (name === "rea_get_report") {
    const id = requireRunId(args.run_id);
    if (!env.RESULTS) throw new Error("Result storage is not configured");
    const saved = await env.RESULTS.get("report:" + id, { type: "json" });
    return saved || { run_id: id, status: "not_received", detail: "A callback secret must be configured in both Cloudflare and GitHub before reports can be uploaded." };
  }
  if (name === "rea_start_ghidra_demo") {
    if (!(env.ENABLE_DISPATCH === "true" && env.GITHUB_TOKEN && env.RESULTS)) {
      throw new Error("Cloud dispatch is disabled");
    }
    if (args.confirmation !== "RUN GHIDRA DEMO") throw new Error("Explicit confirmation required");
    const day = new Date().toISOString().slice(0, 10);
    const key = "dispatch:" + day;
    const used = Number(await env.RESULTS.get(key) || "0");
    if (used >= 2) throw new Error("Daily demo dispatch budget reached (2 per UTC day)");
    // KV is eventually consistent. This is a soft rate guard, not an absolute spending cap.
    await env.RESULTS.put(key, String(used + 1), { expirationTtl: 172800 });
    await github("/actions/workflows/" + WORKFLOW_ID + "/dispatches", env, {
      method: "POST", body: { ref: "main" },
    });
    return {
      accepted: true, repository: REPO, workflow: WORKFLOW_ID,
      note: "GitHub accepted the demo dispatch. Poll rea_list_runs to obtain the new run ID.",
    };
  }
  throw new Error("Unknown or unavailable tool");
}
function jsonRpcError(id, code, message) {
  return responseJson({ jsonrpc: "2.0", id, error: { code, message } });
}
async function mcp(request, env) {
  if (!env.MCP_AUTH_TOKEN) return fail("MCP access is locked: configure MCP_AUTH_TOKEN in Cloudflare Worker Secrets.", 503);
  if (!await bearerOK(request, env.MCP_AUTH_TOKEN)) {
    return responseJson({ error: "Unauthorized" }, 401, { "www-authenticate": 'Bearer realm="FXGA REA MCP"' });
  }
  if (request.method !== "POST") {
    return responseJson({ error: "Only stateless Streamable HTTP POST is supported." }, 405, { "allow": "POST" });
  }
  const origin = request.headers.get("Origin");
  if (origin && !["https://chatgpt.com", "https://chat.openai.com"].includes(origin)) {
    return fail("Origin is not allowed", 403);
  }
  const body = await request.text();
  if (body.length > 65536) return fail("Request too large", 413);
  let req;
  try { req = JSON.parse(body); } catch { return jsonRpcError(null, -32700, "Parse error"); }
  if (!req || Array.isArray(req) || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return jsonRpcError(null, -32600, "Invalid Request");
  }
  if (req.method.startsWith("notifications/")) return new Response(null, { status: 202 });
  const id = req.id === undefined ? null : req.id;
  if (req.method === "initialize") {
    const versions = ["2025-06-18", "2025-03-26"];
    const requested = req.params && req.params.protocolVersion;
    const version = versions.includes(requested) ? requested : versions[0];
    return responseJson({ jsonrpc: "2.0", id, result: {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "FXGA REA Cloud MCP", version: VERSION },
      instructions: "Runs Ghidra via GitHub Actions on demand. Tools operate only on fixed REA workflows. This gateway does not accept arbitrary binaries or shell commands.",
    }});
  }
  if (req.method === "ping") return responseJson({ jsonrpc: "2.0", id, result: {} });
  if (req.method === "tools/list") return responseJson({ jsonrpc: "2.0", id, result: { tools: availableTools(env) } });
  if (req.method === "tools/call") {
    const name = req.params && req.params.name;
    if (typeof name !== "string" || !availableTools(env).some(t => t.name === name)) {
      return jsonRpcError(id, -32602, "Unknown or unavailable tool");
    }
    try {
      const out = await callTool(name, req.params.arguments || {}, env);
      return responseJson({ jsonrpc: "2.0", id, result: {
        content: [{ type: "text", text: JSON.stringify(out) }], isError: false,
      }});
    } catch (e) {
      return responseJson({ jsonrpc: "2.0", id, result: {
        content: [{ type: "text", text: String(e?.message || "Operation failed").slice(0, 512) }], isError: true,
      }});
    }
  }
  return jsonRpcError(id, -32601, "Method not found");
}
async function uploadReport(request, env) {
  if (!env.REA_CALLBACK_TOKEN || !env.RESULTS) return fail("Report callbacks are not configured", 503);
  if (request.method !== "POST") return fail("Method not allowed", 405);
  if (!await bearerOK(request, env.REA_CALLBACK_TOKEN)) return authDenied();
  const body = await request.text();
  if (body.length > 32768) return fail("Report too large", 413);
  let data;
  try { data = JSON.parse(body); } catch { return fail("Invalid JSON report", 400); }
  const run_id = validRunId(data?.run_id);
  if (!run_id || data?.kind !== "fxga-rea-ghidra-demo" || typeof data?.excerpt !== "string" || data.excerpt.length > 20000) {
    return fail("Invalid demo report schema", 400);
  }
  const run = await github("/actions/runs/" + run_id, env);
  if (run.name !== WORKFLOW_NAME || run.head_repository?.full_name !== REPO) {
    return fail("Unrecognized GitHub run", 403);
  }
  const saved = {
    kind: "fxga-rea-ghidra-demo", run_id,
    status: "completed", repo: REPO, run_url: run.html_url,
    received_at: new Date().toISOString(), excerpt: data.excerpt,
  };
  await env.RESULTS.put("report:" + run_id, JSON.stringify(saved), { expirationTtl: 604800 });
  return responseJson({ stored: true, run_id }, 201);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return responseJson({
        service: "fxga-rea-cloud-mcp", version: VERSION,
        status: env.MCP_AUTH_TOKEN ? "protected" : "locked",
        github_repository: REPO,
        cloud_dispatch_ready: Boolean(env.MCP_AUTH_TOKEN && env.GITHUB_TOKEN && env.ENABLE_DISPATCH === "true"),
        report_callbacks_ready: Boolean(env.REA_CALLBACK_TOKEN && env.RESULTS),
        note: "Bearer authentication required; OAuth for native ChatGPT has not yet been configured.",
      });
    }
    if (url.pathname === "/mcp") return mcp(request, env);
    if (url.pathname === "/reports/upload") return uploadReport(request, env);
    return fail("Not found", 404);
  },
};
