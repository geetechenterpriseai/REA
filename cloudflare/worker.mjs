// FXGA REA Cloud MCP gateway (no arbitrary commands or target uploads).
// Public, read-only MCP. No token, OAuth, dispatch, or arbitrary binary submission.
// It implements a stateless JSON-RPC MCP Streamable HTTP subset over POST /mcp.

const REPO = "geetechenterpriseai/REA";
const WORKFLOW_NAME = "REA - Ghidra Cloud Demo";
const VERSION = "0.2.0";

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
async function github(path) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "FXGA-REA-Cloud-MCP",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const res = await fetch("https://api.github.com/repos/" + REPO + path, {
    method: "GET",
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(12000),
  });
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
    description: "Read the published public, sanitized Ghidra demo report from the GitHub repository.",
    inputSchema: { type: "object", properties: { run_id: { type: "integer", minimum: 1 } }, required: ["run_id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "rea_get_latest_report",
    description: "Read the latest published Ghidra demo report. Uses public GitHub data; no authentication.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];
function availableTools() { return baseTools; }
async function callTool(name, args) {
  args = args && typeof args === "object" && !Array.isArray(args) ? args : {};
  if (name === "rea_list_runs") {
    const limit = inputNumber(args.limit, 5, 1, 10);
    const data = await github("/actions/runs?per_page=" + Math.max(limit, 10));
    return { repository: REPO, runs: (data.workflow_runs || []).filter(r => r.name === WORKFLOW_NAME || r.name === "REA - Install and Verify" || r.name === "REA - Cloudflare MCP Tests").slice(0, limit).map(safeRun) };
  }
  if (name === "rea_get_run") {
    const id = requireRunId(args.run_id);
    const run = await github("/actions/runs/" + id);
    if (run.name !== WORKFLOW_NAME && run.name !== "REA - Install and Verify") {
      throw new Error("Run is outside the allowlisted REA workflows");
    }
    const jobs = await github("/actions/runs/" + id + "/jobs?per_page=10");
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
    const run = await github("/actions/runs/" + id);
    if (run.name !== WORKFLOW_NAME) throw new Error("Only demo reports are supported");
    const data = await github("/actions/runs/" + id + "/artifacts?per_page=10");
    return {
      run_id: id, artifacts: (data.artifacts || []).slice(0, 10).map(a => ({
        name: a.name, size_in_bytes: a.size_in_bytes,
        expires_at: a.expires_at, expired: a.expired,
        github_run_url: run.html_url,
      })),
    };
  }
  if (name === "rea_get_report" || name === "rea_get_latest_report") {
    const id = name === "rea_get_latest_report" ? "latest" : String(requireRunId(args.run_id));
    try {
      const doc = await github("/contents/public/reports/" + id + ".json");
      if (doc.type !== "file" || doc.encoding !== "base64" || doc.size > 24576 || typeof doc.content !== "string") {
        throw new Error("Public report has an unexpected format");
      }
      const raw = atob(doc.content.replace(/\s/g, ""));
      const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
      const report = JSON.parse(new TextDecoder().decode(bytes));
      if (report.kind !== "fxga-rea-ghidra-demo" || !validRunId(report.run_id) || (id !== "latest" && String(report.run_id) !== id)) {
        throw new Error("Public report failed validation");
      }
      return report;
    } catch (err) {
      if (String(err.message).includes("HTTP 404")) return { status: "not_published", run_id: id, guide: "Use GitHub Actions > REA - Ghidra Cloud Demo > Run workflow. The public report appears after that job completes." };
      throw err;
    }
  }
  throw new Error("Unknown or unavailable tool");
}
function jsonRpcError(id, code, message) {
  return responseJson({ jsonrpc: "2.0", id, error: { code, message } });
}
async function mcp(request) {
  if (request.method !== "POST") {
    return responseJson({ error: "Only stateless Streamable HTTP POST is supported." }, 405, { "allow": "POST" });
  }
  const origin = request.headers.get("Origin");
  if (origin && !["https://chatgpt.com", "https://chat.openai.com", "https://github.com"].includes(origin)) {
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
      instructions: "Public read-only interface for REA Ghidra demo run metadata and published reports. Start analysis manually from GitHub Actions. No command execution, uploads, or workflow dispatch tools.",
    }});
  }
  if (req.method === "ping") return responseJson({ jsonrpc: "2.0", id, result: {} });
  if (req.method === "tools/list") return responseJson({ jsonrpc: "2.0", id, result: { tools: availableTools() } });
  if (req.method === "tools/call") {
    const name = req.params && req.params.name;
    if (typeof name !== "string" || !availableTools().some(t => t.name === name)) {
      return jsonRpcError(id, -32602, "Unknown or unavailable tool");
    }
    try {
      const out = await callTool(name, req.params.arguments || {});
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
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return responseJson({
        service: "fxga-rea-cloud-mcp", version: VERSION,
        status: "public_read_only",
        github_repository: REPO,
        authentication: "none",
        cloud_dispatch_ready: false,
        report_source: "public GitHub repository",
        note: "Public read-only MCP. Start Ghidra demo manually using GitHub Actions; GitHub requires login to start workflows.",
      });
    }
    if (url.pathname === "/mcp") return mcp(request);
    return fail("Not found", 404);
  },
};
