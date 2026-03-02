#!/bin/bash
# Build Docker images on server and push to Docker Hub
# Usage: REPO_DIR=~/vi-agent-repos/<name> ./build-and-push.sh <tag>
#
# Runs ON the server. Expects:
#   - Git repo at $REPO_DIR (default: ~/vi-agent-repo)
#   - Docker Hub login already done (docker login)
#   - Tag exists in the git repo
#
# Example:
#   REPO_DIR=~/vi-agent-repos/casey ./build-and-push.sh dev-20260302-abc1234
set -e

TAG="$1"

if [ -z "$TAG" ]; then
    echo "ERROR: Image tag required"
    echo "Usage: $0 <tag>"
    echo ""
    echo "Examples:"
    echo "  $0 dev-20260302-abc1234   # Build from git tag"
    echo "  $0 latest                 # Build from current HEAD"
    exit 1
fi

REPO_DIR="${REPO_DIR:-$HOME/vi-agent-repo}"
DOCKER_ORG="collov"
SERVICES=(api-server frontend gateway realtime)

cd "$REPO_DIR"

# Checkout the tag if it's not "latest"
if [ "$TAG" != "latest" ]; then
    echo "=== Fetching and checking out tag: $TAG ==="
    git fetch --all --tags
    if git rev-parse "tags/$TAG" > /dev/null 2>&1; then
        git checkout "tags/$TAG"
    elif git rev-parse "origin/$TAG" > /dev/null 2>&1; then
        git checkout "origin/$TAG"
    else
        echo "ERROR: Tag '$TAG' not found in git"
        echo "Available tags:"
        git tag --sort=-creatordate | head -10
        exit 1
    fi
else
    echo "=== Building from current HEAD ==="
    git pull || true
fi

ACTUAL_COMMIT=$(git rev-parse --short HEAD)
echo "Building from commit: $ACTUAL_COMMIT"

# Build and push each service
FAILED=0
for svc in "${SERVICES[@]}"; do
    IMAGE_NAME="${DOCKER_ORG}/vi-agent-${svc}"
    echo ""
    echo "=== Building ${IMAGE_NAME}:${TAG} ==="

    BUILD_ARGS=""
    if [ "$svc" = "frontend" ]; then
        BUILD_ARGS="--build-arg VITE_API_URL= --build-arg VITE_LIVEKIT_URL="
    fi

    if docker build $BUILD_ARGS \
        -t "${IMAGE_NAME}:${TAG}" \
        -t "${IMAGE_NAME}:latest" \
        "./${svc}"; then
        echo "Build OK: ${IMAGE_NAME}:${TAG}"
    else
        echo "ERROR: Build failed for ${svc}"
        FAILED=$((FAILED+1))
        continue
    fi

    echo "Pushing ${IMAGE_NAME}:${TAG}..."
    docker push "${IMAGE_NAME}:${TAG}"
    docker push "${IMAGE_NAME}:latest"
    echo "Push OK: ${IMAGE_NAME}:${TAG}"
done

echo ""
if [ $FAILED -eq 0 ]; then
    echo "=== All images built and pushed ==="
    echo "  Tag:    ${TAG}"
    echo "  Commit: ${ACTUAL_COMMIT}"
    echo "  Images:"
    for svc in "${SERVICES[@]}"; do
        echo "    ${DOCKER_ORG}/vi-agent-${svc}:${TAG}"
    done
else
    echo "=== WARNING: ${FAILED} service(s) failed to build ==="
    exit 1
fi
