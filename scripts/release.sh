#!/bin/sh
# Upgrades the version of one extension, commits it, and tags it <extension>-v<version>.
# Pushing the tag makes GitHub publish the extension to Open VSX (.github/workflows/release.yml).
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: scripts/release.sh <extension> <patch|minor|major>" >&2
  exit 1
fi
extension=$1
bump=$2

cd "$(git rev-parse --show-toplevel)"
if [ ! -f "$extension/package.json" ]; then
  echo "No extension named $extension: $extension/package.json is missing." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi

cd "$extension"
version=$(npm version "$bump" --no-git-tag-version)
version=${version#v}
git add package.json package-lock.json
git commit --message "$extension $version"
git tag --annotate "$extension-v$version" --message "$extension $version"
echo "Tagged $extension-v$version. Push it with: git push origin main --follow-tags"
