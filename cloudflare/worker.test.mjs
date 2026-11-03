import test from 'node:test';
import assert from 'node:assert/strict';
import app from './worker.mjs';

const BASE = 'https://fxga-rea-cloud-mcp.few-nose.workers.dev';
const post = (method, params = {}, extra = {}) => new Request(BASE + '/mcp', {
  method: 'POST', headers: { 'content-type': 'application/json', ...extra },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
});
const readText = async res => JSON.parse((await res.json()).result.content[0].text);

test('health declares publicly accessible read-only service', async () => {
  const res = await app.fetch(new Request(BASE + '/health'), {});
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.status, 'public_read_only');
  assert.equal(data.authentication, 'none');
  assert.equal(data.cloud_dispatch_ready, false);
});
test('MCP initialization needs no credential', async () => {
  const res = await app.fetch(post('initialize', { protocolVersion: '2025-06-18' }), {});
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.equal(out.result.protocolVersion, '2025-06-18');
});
test('public tool catalog exposes only five safe read-only methods', async () => {
  const res = await app.fetch(post('tools/list'), {});
  const out = await res.json();
  assert.deepEqual(out.result.tools.map(t => t.name), [
    'rea_list_runs', 'rea_get_run', 'rea_list_artifacts', 'rea_get_report', 'rea_get_latest_report',
  ]);
  for (const t of out.result.tools) assert.equal(t.annotations?.readOnlyHint, true);
});
test('no exposed job triggering function even when injected config contains tokens', async () => {
  const env = { MCP_AUTH_TOKEN: 'unused', GITHUB_TOKEN: 'unused', ENABLE_DISPATCH: 'true' };
  const res = await app.fetch(post('tools/call', { name: 'rea_start_ghidra_demo', arguments: { confirmation: 'RUN GHIDRA DEMO' } }), env);
  assert.equal((await res.json()).error.code, -32602);
});
test('report upload endpoint is not available', async () => {
  const res = await app.fetch(new Request(BASE + '/reports/upload', { method: 'POST', body: '{}' }), {});
  assert.equal(res.status, 404);
});
test('unexpected browser origin is rejected', async () => {
  const res = await app.fetch(post('tools/list', {}, { Origin: 'https://example.invalid' }), {});
  assert.equal(res.status, 403);
});
test('run IDs are validated', async () => {
  const res = await app.fetch(post('tools/call', { name: 'rea_get_run', arguments: { run_id: -5 } }), {});
  assert.equal((await res.json()).result.isError, true);
});
test('public completed reports are indexed from GitHub CDN without a token', async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.match(String(url), /raw\.githubusercontent\.com.*\/index\.json/);
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.Authorization, undefined);
      return new Response(JSON.stringify({ kind: 'fxga-rea-ghidra-demo-index', runs: [
        { name: 'REA - Ghidra Cloud Demo', id: 12345, status: 'completed', conclusion: 'success' },
      ] }), { status: 200 });
    };
    const res = await app.fetch(post('tools/call', { name: 'rea_list_runs', arguments: { limit: 5 } }), {});
    const data = await readText(res);
    assert.equal(data.runs.length, 1);
    assert.equal(data.runs[0].id, 12345);
  } finally { globalThis.fetch = old; }
});
test('latest public report is readable through the CDN without a token', async () => {
  const old = globalThis.fetch;
  try {
    const record = { kind: 'fxga-rea-ghidra-demo', run_id: 12345, excerpt: '{"demo":true}' };
    globalThis.fetch = async (url, opts) => {
      assert.match(String(url), /raw\.githubusercontent\.com.*\/latest\.json/);
      assert.equal(opts.headers.Authorization, undefined);
      return new Response(JSON.stringify(record), { status: 200 });
    };
    const res = await app.fetch(post('tools/call', { name: 'rea_get_latest_report', arguments: {} }), {});
    const data = await readText(res);
    assert.equal(data.run_id, 12345);
    assert.equal(data.excerpt, '{"demo":true}');
  } finally { globalThis.fetch = old; }
});
test('not-yet-published public reports return a useful status', async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('', { status: 404 });
    const res = await app.fetch(post('tools/call', { name: 'rea_get_report', arguments: { run_id: 555 } }), {});
    const data = await readText(res);
    assert.equal(data.status, 'not_published');
  } finally { globalThis.fetch = old; }
});
