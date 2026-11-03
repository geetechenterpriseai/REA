# Security

- This repository is **public**. Only the compiled sample binary is analyzed; never commit private binaries, credentials or proprietary reverse-engineering reports.
- Both GitHub Actions workflows use least-privilege `contents: read` and impose job timeouts.
- The Ghidra workflow executes only via manual `workflow_dispatch`; no arbitrary URL, shell, or user binary inputs are accepted.
- Ghidra is downloaded from the official NSA GitHub release and SHA-256 verified.
- REA is installed from the official pinned npm package `rea-agents@6.8.0`.
- The GitHub runners are temporary, **not an always-on cloud VM**.
- An actual ChatGPT integration needs a separate authenticated remote MCP service, job/result storage, and per-user authorization; those components are **not deployed**.
- To handle confidential data, first switch to a private repository and design an authenticated private upload pipeline.
- Actions minutes and storage count against applicable account budgets; timeouts do not guarantee zero charges.
