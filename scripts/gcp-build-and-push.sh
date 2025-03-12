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
image="us-docker.pkg.dev/lightdash-containers/lightdash/lightdash"

echo "Building with tags: $version-commercial, beta, $timestamp"

gcloud auth configure-docker us-docker.pkg.dev

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

# Delete images to avoid filling up disk space
for tag in "$version-commercial" "beta" "$timestamp"; do
    docker image rm "$image:$tag"
done
