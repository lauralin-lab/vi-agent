#!/bin/bash
set -e

echo "🔄 Starting git sync..."

# 1. Stash local changes (if any)
STASH_RESULT=$(git stash push -m "auto-stash-$(date +%s)" 2>&1)
if echo "$STASH_RESULT" | grep -q "No local changes"; then
  HAS_STASH=false
  echo "📌 No local changes to stash"
else
  HAS_STASH=true
  echo "📦 Stashed local changes"
fi

# 2. Pull with rebase
echo "⬇️  Pulling with rebase..."
if ! git pull --rebase; then
  echo "❌ Rebase failed! Aborting rebase..."
  git rebase --abort
  if [ "$HAS_STASH" = true ]; then
    echo "♻️  Restoring stash..."
    git stash pop
  fi
  echo "❌ Sync failed due to rebase conflict."
  exit 1
fi
echo "✅ Pull rebase successful"

# 3. Push
echo "⬆️  Pushing..."
if ! git push; then
  echo "⚠️  Push failed, but local is up to date."
  if [ "$HAS_STASH" = true ]; then
    git stash pop
  fi
  exit 1
fi
echo "✅ Push successful"

# 4. Reapply stash
if [ "$HAS_STASH" = true ]; then
  echo "♻️  Restoring stashed changes..."
  if ! git stash pop; then
    echo "⚠️  Stash pop had conflicts. Resolve manually."
    exit 1
  fi
  echo "✅ Stash restored"
fi

echo "🎉 Sync complete!"
