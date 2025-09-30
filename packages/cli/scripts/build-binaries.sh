#!/bin/bash

# Build binaries for all platforms
# This script can be used locally or in CI

set -e

echo "🔨 Building Lightdash CLI binaries..."

# Parse command line arguments
SIGN_AND_NOTARIZE=false
CREATE_ARCHIVES=false
TARGETS="node20-macos-x64,node20-macos-arm64,node20-linux-x64,node20-win-x64"

while [[ $# -gt 0 ]]; do
  case $1 in
    --sign)
      SIGN_AND_NOTARIZE=true
      shift
      ;;
    --archive)
      CREATE_ARCHIVES=true
      shift
      ;;
    --mac-only)
      TARGETS="node20-macos-x64,node20-macos-arm64"
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --sign        Sign and notarize macOS binaries (requires env vars)"
      echo "  --archive     Create tar.gz/zip archives and checksums for distribution"
      echo "  --mac-only    Build only macOS binaries"
      echo "  --help        Show this help message"
      echo ""
      echo "Required environment variables for signing:"
      echo "  DEVELOPER_ID              Developer ID Application certificate identity"
      echo "  NOTARY_KEYCHAIN_PROFILE   Keychain profile name with notarization credentials"
      echo ""
      echo "Optional environment variables:"
      echo "  BUNDLE_ID                 Bundle identifier (default: com.lightdash.cli)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "Version: $VERSION"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf bin
rm -rf bundle

# Build the bundle
echo "📦 Creating bundle..."
pnpm bundle

# Build binaries
echo "🏗️ Building binaries for targets: $TARGETS"

# Build each target separately to ensure consistent naming
IFS=',' read -ra TARGET_ARRAY <<< "$TARGETS"
for target in "${TARGET_ARRAY[@]}"; do
  echo "  Building $target..."

  # Determine output name based on target
  case $target in
    node20-macos-x64)
      OUTPUT_NAME="bin/lightdash-macos-x64"
      ;;
    node20-macos-arm64)
      OUTPUT_NAME="bin/lightdash-macos-arm64"
      ;;
    node20-linux-x64)
      OUTPUT_NAME="bin/lightdash-linux-x64"
      ;;
    node20-win-x64)
      OUTPUT_NAME="bin/lightdash-win-x64"
      ;;
    *)
      echo "Unknown target: $target"
      exit 1
      ;;
  esac

  pnpm exec pkg bundle/index.js \
    --config pkg.config.json \
    --targets $target \
    --output $OUTPUT_NAME \
    --compress Brotli
done

echo "✅ Binaries built successfully!"
echo ""
echo "📁 Output files:"
ls -lah bin/

# Sign and notarize macOS binaries if requested
if [ "$SIGN_AND_NOTARIZE" = true ] && [[ "$TARGETS" == *"macos"* ]]; then
  echo ""
  echo "🔐 Starting macOS signing and notarization process..."

  # Check for required environment variables
  if [ -z "$DEVELOPER_ID" ] || [ -z "$NOTARY_KEYCHAIN_PROFILE" ]; then
    echo "❌ Error: Missing required environment variables for signing"
    echo "Required: DEVELOPER_ID, NOTARY_KEYCHAIN_PROFILE"
    echo ""
    echo "To create a keychain profile, run:"
    echo "  xcrun notarytool store-credentials <profile-name> --apple-id <apple-id> --team-id <team-id>"
    exit 1
  fi

  # Set default bundle ID if not provided
  BUNDLE_ID=${BUNDLE_ID:-"com.lightdash.cli"}

  # Function to sign a binary
  sign_binary() {
    local BINARY_NAME=$1

    if [ ! -f "bin/$BINARY_NAME" ]; then
      echo "⚠️  Skipping $BINARY_NAME (not built)"
      return
    fi

    echo "🖊️  Signing $BINARY_NAME..."

    # Make binary executable
    chmod +x "bin/$BINARY_NAME"

    # Sign the binary
    codesign -s "$DEVELOPER_ID" -f --timestamp -o runtime \
      -i "$BUNDLE_ID" --entitlements entitlements.plist \
      "bin/$BINARY_NAME"

    # Verify signature
    if codesign --verify --verbose "bin/$BINARY_NAME"; then
      echo "✓ Successfully signed $BINARY_NAME"
    else
      echo "✗ Failed to sign $BINARY_NAME"
      exit 1
    fi
  }

  # Function to notarize a binary
  notarize_binary() {
    local BINARY_NAME=$1

    if [ ! -f "bin/$BINARY_NAME" ]; then
      echo "⚠️  Skipping notarization of $BINARY_NAME (not found)"
      return
    fi

    echo "📝 Notarizing $BINARY_NAME..."

    # Create temporary directory for notarization
    mkdir -p notarize-temp
    local ZIP_PATH="notarize-temp/${BINARY_NAME}.zip"

    # Create zip for notarization
    ditto -c -k --keepParent "bin/$BINARY_NAME" "$ZIP_PATH"

    # Submit for notarization and wait using existing keychain profile
    if xcrun notarytool submit "$ZIP_PATH" \
      --keychain-profile "$NOTARY_KEYCHAIN_PROFILE" \
      --wait; then
      echo "✓ Successfully notarized $BINARY_NAME"
    else
      echo "✗ Failed to notarize $BINARY_NAME"
      echo "  You can check the log with: xcrun notarytool log <submission-id> --keychain-profile $NOTARY_KEYCHAIN_PROFILE"
      exit 1
    fi
  }

  # Sign macOS binaries
  sign_binary "lightdash-macos-x64"
  sign_binary "lightdash-macos-arm64"

  # Notarize macOS binaries
  notarize_binary "lightdash-macos-x64"
  notarize_binary "lightdash-macos-arm64"

  # Clean up
  rm -rf notarize-temp

  echo ""
  echo "🎉 macOS binaries signed and notarized successfully!"
fi

# Create archives and checksums if requested
if [ "$CREATE_ARCHIVES" = true ]; then
  echo ""
  echo "📦 Creating distribution archives..."

  # Clean up any existing archives
  rm -f lightdash-cli-*.tar.gz
  rm -f lightdash-cli-*.zip
  rm -f checksums-*.txt

  # Use git tag or package.json version
  if git describe --exact-match --tags HEAD 2>/dev/null; then
    VERSION=$(git describe --exact-match --tags HEAD)
  else
    VERSION="v$(node -p "require('./package.json').version")"
  fi

  echo "Using version: $VERSION"

  # Create archives based on what was built
  if [ -f "bin/lightdash-macos-x64" ]; then
    echo "  Creating macOS x64 archive..."
    tar -czf "lightdash-cli-${VERSION}-macos-x64.tar.gz" -C bin lightdash-macos-x64
  fi

  if [ -f "bin/lightdash-macos-arm64" ]; then
    echo "  Creating macOS arm64 archive..."
    tar -czf "lightdash-cli-${VERSION}-macos-arm64.tar.gz" -C bin lightdash-macos-arm64
  fi

  if [ -f "bin/lightdash-linux-x64" ]; then
    echo "  Creating Linux x64 archive..."
    tar -czf "lightdash-cli-${VERSION}-linux-x64.tar.gz" -C bin lightdash-linux-x64
  fi

  if [ -f "bin/lightdash-win-x64.exe" ]; then
    echo "  Creating Windows x64 archive..."
    # Check if we have 7z or zip available
    if command -v 7z &> /dev/null; then
      7z a -tzip "lightdash-cli-${VERSION}-win-x64.zip" ./bin/lightdash-win-x64.exe
    elif command -v zip &> /dev/null; then
      (cd bin && zip "../lightdash-cli-${VERSION}-win-x64.zip" lightdash-win-x64.exe)
    else
      echo "  ⚠️  Neither 7z nor zip found, skipping Windows archive"
    fi
  fi

  # Create checksums for all archives
  echo ""
  echo "🔐 Creating checksums..."

  # Create platform-specific checksum files
  if ls lightdash-cli-*-macos-*.tar.gz 1> /dev/null 2>&1; then
    shasum -a 256 lightdash-cli-*-macos-*.tar.gz > checksums-macos-sha256.txt
    echo "  Created checksums-macos-sha256.txt"
  fi

  if [ -f "lightdash-cli-${VERSION}-linux-x64.tar.gz" ]; then
    shasum -a 256 "lightdash-cli-${VERSION}-linux-x64.tar.gz" > checksums-linux-sha256.txt
    echo "  Created checksums-linux-sha256.txt"
  fi

  if [ -f "lightdash-cli-${VERSION}-win-x64.zip" ]; then
    shasum -a 256 "lightdash-cli-${VERSION}-win-x64.zip" > checksums-windows-sha256.txt
    echo "  Created checksums-windows-sha256.txt"
  fi

  # Also create a combined checksums file
  if ls lightdash-cli-*.{tar.gz,zip} 1> /dev/null 2>&1; then
    shasum -a 256 lightdash-cli-*.tar.gz lightdash-cli-*.zip 2>/dev/null | grep -v "No such file" > checksums-all-sha256.txt || true
    if [ -s checksums-all-sha256.txt ]; then
      echo "  Created checksums-all-sha256.txt"
    else
      rm -f checksums-all-sha256.txt
    fi
  fi

  echo ""
  echo "📁 Distribution files created:"
  ls -lah lightdash-cli-*.{tar.gz,zip} checksums-*.txt 2>/dev/null | grep -v "No such file" || true

  echo ""
  echo "📤 To upload to GitHub release:"
  echo "  gh release upload ${VERSION} \\"
  echo "    lightdash-cli-*.tar.gz lightdash-cli-*.zip checksums-*.txt \\"
  echo "    --clobber"
fi

echo ""
echo "🎯 Next steps:"
if [ "$SIGN_AND_NOTARIZE" = false ] && [[ "$TARGETS" == *"macos"* ]]; then
  echo "  - For macOS: Run with --sign to sign and notarize the binaries"
fi
if [ "$CREATE_ARCHIVES" = false ]; then
  echo "  - Run with --archive to create distribution archives"
fi
echo "  - Test binaries on target platforms"
echo "  - Share with third parties or upload to releases"