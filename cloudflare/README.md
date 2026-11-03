# FXGA REA — Cloudflare Gateway

Deployed Worker: `fxga-rea-cloud-mcp`
Cloudflare account: **FX Global Avengers Trading Academy**
Endpoint: `https://fxga-rea-cloud-mcp.few-nose.workers.dev/mcp`
Health: `https://fxga-rea-cloud-mcp.few-nose.workers.dev/health`

## Architecture

Cloudflare Workers hosts a **stateless, bearer-protected read-only MCP gateway** to a fixed GitHub repository `geetechenterpriseai/REA`. The REA CLI + Ghidra execute only on short-lived GitHub Actions Ubuntu runners. A dedicated KV namespace `FXGA_REA_MCP_RESULTS` stores sanitized demo reports for 7 days. This is **not** a permanent Ghidra session and is **not** a general shell or binary upload service.

## Configure secrets WITHOUT putting them into this public repository or chat

1. In **Cloudflare Dashboard → Workers & Pages → fxga-rea-cloud-mcp → Settings → Variables and Secrets**, add a strong unique **secret** named `MCP_AUTH_TOKEN`. The Worker is deliberately locked with HTTP 503 until this is set. Use a password manager to generate a long random value. A client must supply it using `Authorization: Bearer <token>`.
2. To enable Cloudflare-triggered GitHub demo runs, create a **fine-grained GitHub Personal Access Token** with repository access **only** to `geetechenterpriseai/REA` and **Actions: Read and write**. Save it in Cloudflare as the **secret** `GITHUB_TOKEN`. Do not use a broad classic PAT. Add a plain-text Worker variable `ENABLE_DISPATCH` = `true`. Until BOTH are present the dispatch tool is withheld. The demo workflow has a 30-minute timeout. The gateway includes a **soft** limit of two dispatches per UTC day; KV is not strongly consistent and this must not be treated as a guaranteed spending cap.
3. For automatic demo result storage, generate a second distinct long random value. Add it as a Cloudflare Worker **secret** named `REA_CALLBACK_TOKEN`, then add that exact value under **GitHub → geetechenterpriseai/REA → Settings → Secrets and variables → Actions → New repository secret**, also named `REA_CALLBACK_TOKEN`. The demo-only Actions job then POSTs a bounded summary to `/reports/upload` using HTTPS. Do not put it in a GitHub workflow variable.
4. Check `/health`. `protected` means the MCP auth secret exists, `cloud_dispatch_ready: true` means the demo dispatch inputs are configured, and `report_callbacks_ready: true` indicates the Cloudflare callback secret and KV binding are configured. You must still test GitHub callback delivery and GitHub token permissions independently.

## MCP methods

- `rea_list_runs(limit)` — list public workflow run summaries
- `rea_get_run(run_id)` — fixed allowlist of REA workflows and bounded step details
- `rea_list_artifacts(run_id)` — list report archive metadata for Ghidra demonstration runs
- `rea_get_report(run_id)` — fetch a previously received sanitized demo report from KV
- `rea_start_ghidra_demo(confirmation='RUN GHIDRA DEMO')` — **not shown** until specifically enabled and a GitHub token is configured

Only the example `rea-ghidra-demo.yml` workflow can be dispatched. Arbitrary binary downloads, command execution, workflow IDs and repository names are forbidden. The Worker exposes a local subset of JSON-RPC MCP over POST `/mcp` with stateless responses and requires a bearer token.

## Important: ChatGPT native plugin connectivity is a separate next step

The gateway currently uses a pre-shared bearer token, NOT a browser-based OAuth authorization server. Modern native ChatGPT custom MCP connections may require OAuth and eligible workspace access. To use it from ChatGPT, deploy a compatible authorization server (for example Cloudflare's `@cloudflare/workers-oauth-provider` with Cloudflare Access or GitHub sign-in), then ensure authorization is actually configured and tested. Do not add this URL as an unauthenticated custom MCP server.

## Test with a local API client (never paste actual secrets into chat)

Use a trusted MCP client configured for Streamable HTTP and a bearer header. `POST /mcp` with JSON-RPC method `initialize`, then `tools/list`. Expect 401 for a bad token, 503 while no Cloudflare MCP secret exists. A health GET is public and deliberately does not expose tokens.

## Free-plan and safety

- The Worker performs short GitHub API requests and KV reads; Ghidra CPU work is on GitHub Actions, not Cloudflare.
- Cloudflare and GitHub have separate usage limits; monitor both. Workflow timeouts and a soft KV dispatch counter are **not** a billing hard-stop.
- A **public GitHub repository is only suitable for the generated demo binary**; never upload private EX5 binaries, decompiled source, or third-party confidential data. Create a private repository and secure input storage before real binary analysis.
- Never share GitHub PATs, Worker tokens, or callback secrets in ChatGPT messages or workflow logs.
- The API currently exposes no public reports other than a sanitized health response; all MCP tools and upload methods are protected and fail closed if their secrets are absent.

Official references: [REA GitHub](https://github.com/morluto/rea), [Cloudflare OAuth for MCP](https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/), [GitHub workflow dispatch API](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event).
