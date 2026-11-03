import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import app from './worker.mjs';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const BASE = 'https://fxga-rea-cloud-mcp.few-nose.workers.dev';
const secrets = { MCP_AUTH_TOKEN: 'test-only-local-token' };
function post(path, data, token = 'test-only-local-token', opts = {}) {
  return new Request(BASE + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(opts.origin ? { Origin: opts.origin } : {}),
    },
    body: JSON.stringify(data),
  });
}
function rpc(method, params = {}, id = 1) {
  return { jsonrpc: '2.0', id, method, params };
}
test('public health reveals readiness but no secrets', async () => {
  const result = await app.fetch(new Request(BASE + '/health'), {});
  const j = await result.json();
  assert.equal(result.status, 200);
  assert.equal(j.status, 'locked');
  assert.equal(j.github_repository, 'geetechenterpriseai/REA');
});
test('missing MCP secret fails closed', async () => {
  const res = await app.fetch(post('/mcp', rpc('tools/list')), {});
  assert.equal(res.status, 503);
});
test('wrong token is denied', async () => {
  const res = await app.fetch(post('/mcp', rpc('tools/list'), 'wrong'), secrets);
  assert.equal(res.status, 401);
});
test('correct token allows initialize', async () => {
  const res = await app.fetch(post('/mcp', rpc('initialize', { protocolVersion: '2025-06-18' })), secrets);
  const j = await res.json();
  assert.equal(res.status, 200);
  assert.equal(j.result.protocolVersion, '2025-06-18');
});
test('dispatch tool is withheld until explicitly enabled', async () => {
  const res = await app.fetch(post('/mcp', rpc('tools/list')), secrets);
  const j = await res.json();
  assert.deepEqual(j.result.tools.map(x => x.name), ['rea_list_runs', 'rea_get_run', 'rea_list_artifacts', 'rea_get_report']);
});
test('unexpected browser origin is rejected', async () => {
  const res = await app.fetch(post('/mcp', rpc('tools/list'), 'test-only-local-token', { origin: 'https://evil.invalid' }), secrets);
  assert.equal(res.status, 403);
});
test('callbacks also fail closed with no secret', async () => {
  const res = await app.fetch(post('/reports/upload', {}), secrets);
  assert.equal(res.status, 503);
});
test('authorized demo callback stores a constrained report', async () => {
  const oldFetch = globalThis.fetch;
  const values = new Map();
  const kv = {
    get: async (k, options) => {
      const value = values.get(k) ?? null;
      return value && options?.type === 'json' ? JSON.parse(value) : value;
    },
    put: async (k, v) => { values.set(k, v); },
  };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      id: 12345, name: 'REA - Ghidra Cloud Demo',
      head_repository: { full_name: 'geetechenterpriseai/REA' },
      html_url: 'https://github.com/geetechenterpriseai/REA/actions/runs/12345',
    }), { headers: { 'content-type': 'application/json' } });
    const env = { ...secrets, REA_CALLBACK_TOKEN: 'test-callback', RESULTS: kv };
    const res = await app.fetch(post('/reports/upload', {
      kind: 'fxga-rea-ghidra-demo', run_id: 12345, excerpt: '{"success":true}',
    }, 'test-callback'), env);
    assert.equal(res.status, 201);
    const read = await app.fetch(post('/mcp', rpc('tools/call', {
      name: 'rea_get_report', arguments: { run_id: 12345 },
    })), env);
    const report = JSON.parse((await read.json()).result.content[0].text);
    assert.equal(report.run_id, 12345);
    assert.equal(report.excerpt, '{"success":true}');
  } finally {
    globalThis.fetch = oldFetch;
  }
});
