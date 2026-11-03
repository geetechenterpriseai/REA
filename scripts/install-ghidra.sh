#!/usr/bin/env bash
set -Eeuo pipefail
: "$RUNNER_TEMP"  # GitHub-hosted ephemeral runner only
: "$GITHUB_ENV"
[[ -n "$RUNNER_TEMP" && -n "$GITHUB_ENV" ]] || exit 1

# Official NSA Ghidra 12.1.4 asset, pinned SHA-256 from GitHub release metadata.
GHIDRA_ZIP='ghidra_12.1.4_PUBLIC_20260921.zip'
GHIDRA_URL='https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_12.1.4_build/ghidra_12.1.4_PUBLIC_20260921.zip'
GHIDRA_SHA256='ddac49f903da9d5bac833e5cc79395098b9c33cfd3279be5f31bd00387d2d4db'

mkdir -p "$RUNNER_TEMP/fxga-ghidra"
archive="$RUNNER_TEMP/fxga-ghidra/$GHIDRA_ZIP"
curl --proto '=https' --tlsv1.2 --fail --location --retry 3 --retry-delay 3 --output "$archive" "$GHIDRA_URL"
echo "$GHIDRA_SHA256  $archive" | sha256sum --check --status
unzip -q "$archive" -d "$RUNNER_TEMP/fxga-ghidra"
install_dir="$RUNNER_TEMP/fxga-ghidra/ghidra_12.1.4_PUBLIC"
[[ -f "$install_dir/support/analyzeHeadless" ]] || { echo 'Ghidra files missing after verification' >&2; exit 1; }
printf 'GHIDRA_INSTALL_DIR=%s\n' "$install_dir" >> "$GITHUB_ENV"
printf 'Verified Ghidra at %s\n' "$install_dir"
