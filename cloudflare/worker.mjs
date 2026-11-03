// FXGA REA Cloud MCP gateway (no arbitrary commands or target uploads).
// Public, read-only MCP. No token, OAuth, dispatch, or arbitrary binary submission.
// It implements a stateless JSON-RPC MCP Streamable HTTP subset over POST /mcp.

const REPO = "geetechenterpriseai/REA";
const WORKFLOW_NAME = "REA - Ghidra Cloud Demo";
const VERSION = "0.3.0";

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
// Anonymous, fixed-path public CDN reads; no GitHub REST API or credentials.
async function readPublicFile(filename) {
  if (!/^(latest|index|[1-9][0-9]{0,13})\.json$/.test(filename)) throw new Error("Invalid report filename");
  const url = "https://raw.githubusercontent.com/" + REPO + "/main/public/reports/" + filename;
  const res = await fetch(url, {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
    headers: { "Accept": "application/json" },
  });
  if (res.status === 404) throw new Error("Public report is not published");
  if (!res.ok) throw new Error("Public GitHub report CDN returned HTTP " + res.status);
  if (Number(res.headers.get("content-length") || 0) > 24000) throw new Error("Report too large");
  const body = await res.text();
  if (body.length > 24000) throw new Error("Report too large");
  const data = JSON.parse(body);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid public report");
  return data;
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
    description: "List recent completed REA Ghidra demo reports published to a public repository (read-only; not live job status).",
    inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 10, default: 5 } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "rea_get_run",
    description: "Get a published successful Ghidra demo run's summary (read-only).",
    inputSchema: { type: "object", properties: { run_id: { type: "integer", minimum: 1 } }, required: ["run_id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "rea_list_artifacts",
    description: "Get the public report link for a completed Ghidra demonstration run.",
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
    const index = await readPublicFile("index.json");
    if (index.kind !== "fxga-rea-ghidra-demo-index" || !Array.isArray(index.runs)) throw new Error("Invalid public index");
    return { repository: REPO, source: "published_demo_reports", runs: index.runs.slice(0, limit) };
  }
  if (name === "rea_get_run") {
    const id = requireRunId(args.run_id);
    const report = await readPublicFile(String(id) + ".json");
    if (report.kind !== "fxga-rea-ghidra-demo" || report.run_id !== id) throw new Error("Invalid run report");
    return { repository: REPO, run: { id, name: WORKFLOW_NAME, status: "completed", conclusion: "success", url: report.run_url, published_at: report.published_at }, note: "Published completed demo only; check GitHub Actions for live job progress" };
  }
  if (name === "rea_list_artifacts") {
    const id = requireRunId(args.run_id);
    const report = await readPublicFile(String(id) + ".json");
    if (report.kind !== "fxga-rea-ghidra-demo" || report.run_id !== id) throw new Error("Invalid run report");
    return { run_id: id, artifacts: [{ name: "public-demo-report", url: "https://github.com/" + REPO + "/blob/main/public/reports/" + id + ".json", available: true }] };
  }
  if (name === "rea_get_report" || name === "rea_get_latest_report") {
    const file = name === "rea_get_latest_report" ? "latest.json" : String(requireRunId(args.run_id)) + ".json";
    try {
      const report = await readPublicFile(file);
      if (report.kind !== "fxga-rea-ghidra-demo" || !validRunId(report.run_id) || (name === "rea_get_report" && report.run_id !== requireRunId(args.run_id))) throw new Error("Public report failed validation");
      return report;
    } catch (e) {
      if (String(e.message).includes("not published")) return { status: "not_published", run_id: args.run_id || null, guide: "Run the demo from the GitHub Actions website; wait for its public report commit." };
      throw e;
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
      instructions: "Public read-only interface to published successful Ghidra demos, not live job progress. Start new demos manually via GitHub Actions. No credentials, commands, uploads, or workflow dispatch.",
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
