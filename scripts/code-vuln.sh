#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
repo_root=$PWD
export GOTOOLCHAIN=local
scan() (
  cd "$repo_root/$1"
  expected=$(awk '$1 == "toolchain" {sub(/^go/, "", $2); print $2; exit}' go.mod)
  if [ -z "$expected" ]; then
    expected=$(awk '$1 == "go" {print $2; exit}' go.mod)
  fi
  actual=$(go env GOVERSION)
  go version
  case "$expected" in
    *.*.*) [ "$actual" = "go$expected" ] || { echo "Expected Go $expected; found $actual. Select the project toolchain first." >&2; exit 1; } ;;
    *) case "$actual" in "go$expected".*) ;; *) echo "Expected Go $expected.x; found $actual." >&2; exit 1 ;; esac ;;
  esac
  tools_dir=$(mktemp -d)
  trap 'rm -rf "$tools_dir"' EXIT HUP INT TERM
  GOBIN="$tools_dir" go install "golang.org/x/vuln/cmd/govulncheck@$2"
  "$tools_dir/govulncheck" ./...
)
case "${1:-all}" in
  server) scan server v1.9.0 ;;
  all)
    scan server v1.9.0
    ;;
  *) echo "Unknown Go module: $1" >&2; exit 2 ;;
esac
