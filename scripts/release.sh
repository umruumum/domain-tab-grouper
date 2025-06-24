#!/bin/bash

# Chrome Extension Release Helper Script
# Usage: ./scripts/release.sh <version>
# Example: ./scripts/release.sh 1.0.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if version is provided
if [ $# -eq 0 ]; then
    print_error "Version number is required"
    echo "Usage: $0 <version>"
    echo "Example: $0 1.0.0"
    exit 1
fi

VERSION=$1
TAG_NAME="v$VERSION"

# Validate version format
if [[ ! $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Invalid version format. Use semantic versioning (e.g., 1.0.0)"
    exit 1
fi

print_status "Starting release process for version $VERSION"

# Check if we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    print_error "Must be on main branch to create release. Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    print_error "Working directory is not clean. Please commit or stash changes first."
    git status --short
    exit 1
fi

# Pull latest changes
print_status "Pulling latest changes from origin/main"
git pull origin main

# Update manifest.json version
print_status "Updating manifest.json version to $VERSION"
jq ".version = \"$VERSION\"" manifest.json > manifest.json.tmp
mv manifest.json.tmp manifest.json

# Show the diff
print_status "Version change preview:"
git diff manifest.json

# Confirm the changes
echo ""
read -p "Do you want to proceed with this version update? (y/N): " -r
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Release cancelled by user"
    git checkout manifest.json
    exit 0
fi

# Commit version change
print_status "Committing version update"
git add manifest.json
git commit -m "chore: bump version to $VERSION

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Create and push tag
print_status "Creating and pushing tag $TAG_NAME"
git tag -a "$TAG_NAME" -m "Release $TAG_NAME

Chrome Extension version $VERSION

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push changes and tag
git push origin main
git push origin "$TAG_NAME"

print_success "Release process completed!"
print_status "GitHub Actions will now build and create the release automatically"
print_status "Release will be available at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/releases/tag/$TAG_NAME"

echo ""
print_status "What happens next:"
echo "1. GitHub Actions builds the extension package"
echo "2. Creates a GitHub Release with changelog"
echo "3. Attaches the .zip file for distribution"
echo "4. Users can download and install the extension"