#!/usr/bin/env bash
#
# Files this rebuild REMOVES.
#
# Copying the new files over an existing checkout is not enough: an unzip
# leaves anything the archive doesn't contain exactly where it was, and these
# still import symbols that no longer exist — so the build fails on them rather
# than on anything you changed.
#
# Run once from the project root, then commit. Safe to run twice.
set -euo pipefail

paths=(
  # superseded by components/studio/* (the ported studio interfaces)
  components/ImageGenerator.tsx
  components/VideoGenerator.tsx
  components/MusicGenerator.tsx
  components/AudioGenerator.tsx
  components/AspectRatioPicker.tsx
  components/image
  components/video

  # music now bills from package credits, so the separate track cap is gone
  lib/music-access.ts

  # only components/video used it
  lib/scene.ts

  # chat routes through OpenRouter only — no direct providers left to
  # translate for or to monitor
  lib/providers/anthropic.ts
  app/api/admin/providers/route.ts
  components/admin/ProviderStatus.tsx
)

if git rev-parse --git-dir > /dev/null 2>&1; then
  git rm -r --ignore-unmatch -q "${paths[@]}"
  echo "Removed and staged. Commit, then: npx tsc --noEmit && npm run build"
else
  rm -rf "${paths[@]}"
  echo "Removed. Now run: npx tsc --noEmit && npm run build"
fi
