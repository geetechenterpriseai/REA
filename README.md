# FXGA REA — Cloud Reverse Engineering

This repository is configured to install **REA (Reverse Engineer Anything)** from [morluto/rea](https://github.com/morluto/rea) using ephemeral **GitHub Actions Linux runners**. No Windows PC is required.

## Use the GitHub cloud installation

1. Open [Actions](https://github.com/geetechenterpriseai/REA/actions).
2. Run **REA - Install and Verify** to install the official pinned npm release `rea-agents@6.8.0` and inspect available providers.
3. Run **REA - Ghidra Cloud Demo** to install Java 21 and Ghidra 12.1.4, compile a harmless ELF sample, and analyze it using `rea inspect --provider ghidra`.
4. Read each job's log and download its one-day test report artifact.

The REA installation is **ephemeral**: GitHub Actions provides a new VM for each run. Neither REA nor Ghidra is a permanent server here. ChatGPT custom MCP access requires a separately deployed authenticated remote gateway; **none is deployed by these workflows**.

## Pinned upstream software

- REA: [`rea-agents` 6.8.0](https://www.npmjs.com/package/rea-agents), [official repository](https://github.com/morluto/rea) (MIT license, upstream copyright morluto).
- Ghidra: [NSA Ghidra 12.1.4](https://github.com/NationalSecurityAgency/ghidra/releases/tag/Ghidra_12.1.4_build), official SHA-256 checked before extraction.
- Node: 24.22.1; JDK: Temurin 21 (native analysis job).

## Security and usage

**Important: this repository is public.** Do not add confidential binaries, API keys, client data, or proprietary reverse-engineering results. The demonstration workflow only analyzes a binary it compiles itself. It does not accept arbitrary shell commands or target URLs. GitHub-hosted Actions logs and artifacts in a public repository may be visible to others. For private targets, first move to a private repository and design a secure input-storage process.

Both workflows use GitHub `contents: read` permissions, limited runtimes, manual-only Ghidra execution, no secret-bearing jobs, and one-day report retention. Actual GitHub usage and costs depend on account limits and billing settings.

Read [SECURITY.md](SECURITY.md) for controls. Upstream [Ghidra setup documentation](https://github.com/morluto/rea/blob/main/docs/installation.md#ghidra) covers local native engine requirements. For existing REA commands, run `rea --help` or `rea providers --json` inside the workflow.
