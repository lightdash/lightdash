#!/bin/bash

set -e

if ! command -v jq &> /dev/null
then
    echo "Command 'jq' could not be found, install it with 'brew install jq' or an equivalent command"
    exit 1
fi

version=$(cat package.json | jq -r '.version')
echo "fork version: $version"
timestamp=$(date +%Y.%m.%d-%H.%M.%S)

# Primary registry (always US)
PRIMARY_REGION="us"
image="${PRIMARY_REGION}-docker.pkg.dev/lightdash-containers/lightdash/lightdash"

# Additional regions to replicate to
# Must be configured via GCP_REPLICA_REGIONS environment variable (comma-separated)
# Format: "region-docker.pkg.dev" prefix (without -docker.pkg.dev suffix)
if [ -z "$GCP_REPLICA_REGIONS" ]; then
    echo "Warning: GCP_REPLICA_REGIONS not set. No image replication will be performed."
    echo "Set GCP_REPLICA_REGIONS to enable replication (e.g., 'europe-west2,asia-northeast1')"
    REPLICA_REGIONS=()
else
    # Parse comma-separated environment variable into array
    IFS=',' read -ra REPLICA_REGIONS <<< "$GCP_REPLICA_REGIONS"
    echo "Replicating to regions: ${REPLICA_REGIONS[*]}"
fi

echo "Building with tags: $version-commercial, beta, $timestamp"

# Configure Docker authentication for primary region
gcloud auth configure-docker "${PRIMARY_REGION}-docker.pkg.dev"

# Configure Docker authentication for all replica regions
for region in "${REPLICA_REGIONS[@]}"; do
    echo "Configuring Docker authentication for ${region}..."
    gcloud auth configure-docker "${region}-docker.pkg.dev"
done

# Check if Sentry environment variables are set
SENTRY_BUILD_ARGS=""
if [ -n "$SENTRY_AUTH_TOKEN" ] && [ -n "$SENTRY_ORG" ] && [ -n "$SENTRY_FRONTEND_PROJECT" ] && [ -n "$SENTRY_BACKEND_PROJECT" ] && [ -n "$SENTRY_ENVIRONMENT" ]; then
    echo "Sentry environment variables detected, uploading sourcemaps to sentry."
    SENTRY_BUILD_ARGS="--build-arg SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN \
                      --build-arg SENTRY_ORG=$SENTRY_ORG \
                      --build-arg SENTRY_RELEASE_VERSION=$version \
                      --build-arg SENTRY_FRONTEND_PROJECT=$SENTRY_FRONTEND_PROJECT \
                      --build-arg SENTRY_BACKEND_PROJECT=$SENTRY_BACKEND_PROJECT \
                      --build-arg SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT"
else
    echo "Sentry environment variables not detected, skipping sourcemaps upload."
fi

# Build Docker image 
docker build . $SENTRY_BUILD_ARGS -t "$image:beta" -t "$image:$timestamp" -t "$image:$version-commercial"

for tag in "$version-commercial" "beta" "$timestamp"; do
    docker push "$image:$tag"
done

# Install gcrane if not already installed (only if we have regions to replicate to)
if [ ${#REPLICA_REGIONS[@]} -gt 0 ]; then
    if ! command -v gcrane &> /dev/null; then
        echo "Installing gcrane..."
        go install github.com/google/go-containerregistry/cmd/gcrane@latest
        export PATH="$(go env GOPATH)/bin:$PATH"
    fi
    
    # Replicate images to all configured regions
    for region in "${REPLICA_REGIONS[@]}"; do
        echo "Replicating images to ${region}..."
        replica_image="${region}-docker.pkg.dev/lightdash-containers/lightdash/lightdash"
        
        for tag in "$version-commercial" "beta" "$timestamp"; do
            echo "  Replicating tag ${tag} to ${region}..."
            gcrane cp "$image:$tag" "$replica_image:$tag"
        done
        
        echo "Completed replication to ${region}"
    done
fi

# Delete images to avoid filling up disk space
for tag in "$version-commercial" "beta" "$timestamp"; do
    docker image rm "$image:$tag"
done
