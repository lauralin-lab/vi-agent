#!/bin/bash
# tw-bump-version.sh — Bump version across all teamwork skill files
# Usage: tw-bump-version.sh <version>
# Example: tw-bump-version.sh 3.4.0
#
# Updates:
#   1. Frontmatter `version:` in all skill .md files
#   2. Hardcoded version strings in help text and init templates
#   3. Reports what changed

set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: tw-bump-version.sh <version>"
  echo "Example: tw-bump-version.sh 3.4.0"
  exit 1
fi

# Derive major.minor for two-segment matches (e.g., "3.4.0" → "3.4")
VERSION_SHORT=$(echo "$VERSION" | sed 's/\.[0-9]*$//')

# Find skill directory (works from anywhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

CHANGED=0

# Collect all files that need version updates
FILES=()
for file in "$SKILL_DIR"/team*.md "$SKILL_DIR"/ONBOARDING.md "$SKILL_DIR"/README.md; do
  [ -f "$file" ] && FILES+=("$file")
done
# Also update the manual (lives outside skill dir)
MANUAL="$(dirname "$SKILL_DIR")/../../docs/teamwork-ai-manual.md"
[ -f "$MANUAL" ] && FILES+=("$MANUAL")

# 1. Update frontmatter version: in all skill .md files
for file in "${FILES[@]}"; do
  OLD=$(grep -m1 '^version:' "$file" 2>/dev/null | sed 's/version: *"//' | sed 's/"//') || true
  if [ -n "$OLD" ] && [ "$OLD" != "$VERSION" ]; then
    sed -i '' "s/^version: \".*\"/version: \"$VERSION\"/" "$file"
    echo "  $(basename "$file"): $OLD → $VERSION"
    CHANGED=$((CHANGED + 1))
  fi
done

# 2. Update hardcoded version in help text and init templates
# Matches both 3-segment (v3.4.0) and 2-segment (v3.4) version strings
for file in "${FILES[@]}"; do
  # "TEAMWORK v3.x.y" or "TEAMWORK v3.x" (2 or 3 segments)
  sed -i '' "s/TEAMWORK v[0-9][0-9]*\.[0-9][0-9]*\(\.[0-9][0-9]*\)*/TEAMWORK v$VERSION/g" "$file"

  # "Teamwork v3.x.y" or "Teamwork v3.x"
  sed -i '' "s/Teamwork v[0-9][0-9]*\.[0-9][0-9]*\(\.[0-9][0-9]*\)*/Teamwork v$VERSION/g" "$file"

  # "(v3.x.y)" or "(v3.x)"
  sed -i '' "s/(v[0-9][0-9]*\.[0-9][0-9]*\(\.[0-9][0-9]*\)*)/(v$VERSION)/g" "$file"

  # "Version 3.x.y" (manual header)
  sed -i '' "s/Version [0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/Version $VERSION/g" "$file"

  # "Skill version: 3.x.y" (README)
  sed -i '' "s/Skill version: [0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/Skill version: $VERSION/g" "$file"

  # skill_version in init template code (always 3-segment)
  if grep -q 'skill_version:' "$file" 2>/dev/null; then
    sed -i '' "s/skill_version: [0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*/skill_version: $VERSION/g" "$file"
  fi
done

echo ""
echo "Bumped $CHANGED file(s) to v$VERSION"
echo "Don't forget to update CHANGELOG.md"
