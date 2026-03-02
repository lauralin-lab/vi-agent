#!/bin/bash
set -e

# ============================================================
# deploy.sh - 发布 iOS 应用到 TestFlight
# 用法:
#   ./deploy.sh           # 普通发布 (beta lane)
#   ./deploy.sh internal  # 内部版本 (beta_internal lane, 包含 DevTools)
# ============================================================

# 项目根目录 = 脚本所在位置向上 4 层
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
IOS_DIR="$PROJECT_DIR/ios"

# 选择 lane
LANE="beta"
LABEL="正式版本"
if [ "$1" = "internal" ]; then
  LANE="beta_internal"
  LABEL="内部版本（包含 DevTools）"
fi

echo "📦 部署模式: $LABEL"
echo ""

echo "🔍 Step 1: Flutter analyze..."
cd "$PROJECT_DIR"
flutter analyze --no-fatal-warnings --no-fatal-infos
echo "✅ Analyze passed"

echo ""
echo "🚀 Step 2: Building & uploading to TestFlight ($LANE)..."
cd "$IOS_DIR"
bundle exec fastlane "$LANE"

echo ""
echo "✅ Deploy complete! Check TestFlight in a few minutes."
