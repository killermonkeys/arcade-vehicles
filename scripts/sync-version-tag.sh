#!/usr/bin/env bash
# Keep git tag vX.Y.Z in sync with pxt.json "version" (source of truth).
# Usage: sync-version-tag.sh [--push]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUSH=0
for arg in "$@"; do
  case "$arg" in
    --push) PUSH=1 ;;
    -h|--help)
      echo "Usage: $0 [--push]"
      echo "Create tag v\$(pxt.json version) on HEAD if missing; optionally push it."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

VERSION="$(python3 -c "import json; print(json.load(open('pxt.json'))['version'])")"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid pxt.json version: $VERSION" >&2
  exit 1
fi

TAG="v${VERSION}"
HEAD="$(git rev-parse HEAD)"

remote_sha() {
  git ls-remote --tags origin "refs/tags/${TAG}" 2>/dev/null | awk '{print $1}'
}

local_sha() {
  git rev-parse -q --verify "refs/tags/${TAG}^{}" 2>/dev/null || true
}

REMOTE_SHA="$(remote_sha || true)"
LOCAL_SHA="$(local_sha)"

if [[ -n "$REMOTE_SHA" ]]; then
  if [[ "$REMOTE_SHA" != "$HEAD" ]]; then
    echo "Remote tag ${TAG} already points at ${REMOTE_SHA}, not HEAD (${HEAD}). Leaving it alone."
    exit 0
  fi
  echo "Tag ${TAG} already on origin at HEAD."
  exit 0
fi

if [[ -n "$LOCAL_SHA" && "$LOCAL_SHA" != "$HEAD" ]]; then
  echo "Local tag ${TAG} points at ${LOCAL_SHA}, not HEAD (${HEAD}). Leaving it alone." >&2
  exit 1
fi

if [[ -z "$LOCAL_SHA" ]]; then
  git tag "$TAG" "$HEAD"
  echo "Created local tag ${TAG} -> ${HEAD}"
else
  echo "Local tag ${TAG} already at HEAD."
fi

if [[ "$PUSH" -eq 1 ]]; then
  git push origin "refs/tags/${TAG}"
  echo "Pushed ${TAG} to origin."
fi
