# Public REA MCP — security boundaries

The Cloudflare Worker is intentionally **public and read-only**. It requires no OAuth, API token, bearer token, key, or password. Anyone with the URL can view public workflow metadata and generated **demo-only** analysis reports.

- **No remote execution:** the Worker cannot trigger GitHub jobs, run shell commands, accept binary uploads, patch source code, or select other repositories.
- **No manually configured secrets:** the Cloudflare Worker has no secret or KV bindings. GitHub supplies temporary built-in `GITHUB_TOKEN` authorization to the isolated report-publishing job, without the user configuring a credential.
- **Bounded output:** API calls only read a fixed public repository; report source is limited to files under `public/reports`, with a strict response-size guard.
- **No private inputs:** the Ghidra job compiles and analyzes a harmless example executable. Never commit confidential binary files, private documents, passwords, or proprietary analysis into the public repository.
- **Ghidra integrity:** the job downloads the official NSA Ghidra 12.1.4 release and verifies its published SHA-256 before extraction. REA is pinned to the official `rea-agents@6.8.0` package.
- **Compute controls:** GitHub demo jobs have timeouts and can be launched manually through the GitHub Actions UI. Public anonymous workflow dispatch is not supported. Editing the specific workflow file currently triggers its test job as well; ordinary users cannot push to the repository's main branch.
- **Public means public:** REA run summaries and published sample reports are visible to anyone. This architecture must be redesigned before analyzing private or proprietary binaries.
- **Hosting costs:** GitHub Actions and Cloudflare have separate platform quotas. The Worker never performs Ghidra decompilation itself.

This remote endpoint uses a stateless subset of MCP Streamable HTTP. Whether the ChatGPT application accepts this server as a custom connector depends on ChatGPT's available connection type and workspace permissions; being public does not guarantee native ChatGPT integration.
