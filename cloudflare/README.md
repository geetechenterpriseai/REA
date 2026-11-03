# FXGA REA — Cloudflare Deployment

**Open access. No credentials or API keys to configure.**

- Public MCP endpoint: `https://fxga-rea-cloud-mcp.few-nose.workers.dev/mcp`
- Public health check: `https://fxga-rea-cloud-mcp.few-nose.workers.dev/health`
- GitHub repo: `https://github.com/geetechenterpriseai/REA`
- Trigger harmless native-binary demonstration: `https://github.com/geetechenterpriseai/REA/actions/workflows/rea-ghidra-demo.yml`
- View latest demo report (once published): `https://github.com/geetechenterpriseai/REA/blob/main/public/reports/latest.json`

## How it works

The Cloudflare Worker exposes a **public, read-only** Model Context Protocol endpoint backed by **public GitHub API endpoints**. It does not need Cloudflare secrets, GitHub personal access tokens, OAuth, KV storage, or a running Windows PC.

Available tools: `rea_list_runs`, `rea_get_run`, `rea_list_artifacts`, `rea_get_report`, and `rea_get_latest_report`. Tools are fixed to the `geetechenterpriseai/REA` public repository, support bounded read operations, and never accept executable commands, uploads, or private targets.

To run a new demo, use the GitHub Actions UI and select **REA - Ghidra Cloud Demo → Run workflow**. GitHub requires you to sign in to dispatch it; **anonymous GitHub Actions job creation is not supported**. The job installs `rea-agents@6.8.0` and Ghidra 12.1.4, analyzes the harmless program it compiles itself, and publishes the sanitized sample result to the repository. GitHub supplies its standard short-lived Actions authorization internally for the report commit. **You do not need to create or configure credentials.**

GitHub's runner is temporary, not a permanent VM. The Cloudflare Worker is an always-accessible lightweight gateway to existing public results. A custom ChatGPT MCP integration still depends on your ChatGPT plan's permitted connection types and registration workflow.

## Security and cost

**This is intentionally public.** Anyone with its URL can read its tools and published harmless demo reports. No unrestricted remote workflow dispatch is exposed, so strangers cannot consume GitHub Actions minutes through the Worker. Private `.ex5`, `.dll`, or other proprietary binaries must not be uploaded to this public repository.

Only public information is returned. Cloudflare Workers usage and GitHub Actions usage are subject to their free-tier quotas and fair-use terms. Run the example workflow only when you need it. The public job publishes the latest report and retains up to ten per-run files, to limit repository growth.

Cloudflare deployment source and details: [`cloudflare/README.md`](cloudflare/README.md). Full source of REA upstream: [morluto/rea](https://github.com/morluto/rea).

## Deployment notes

This Worker is deployed into the FX Global Avengers Trading Academy Cloudflare account as `fxga-rea-cloud-mcp`. Re-deploy from `cloudflare/worker.mjs` and `cloudflare/wrangler.toml` using the authorized Cloudflare account. Do not enable public dispatch, arbitrary command execution, callbacks, or private uploads.
