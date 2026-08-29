#!/usr/bin/env bash
# Vercel build: stage the static game files into public/.
# In a git-linked deploy the files are already checked out; in a manual
# bootstrap deploy they are fetched from the public GitHub repo first.
set -euo pipefail

if [ ! -f game.js ]; then
  curl -sL "https://codeload.github.com/QuengaDesignsDev/defense/tar.gz/refs/heads/claude/galaxy-defense-shapes-remake-qan9hk" | tar -xz --strip-components=1
fi

mkdir -p public
cp -r index.html game.js manifest.webmanifest sw.js icons public/
