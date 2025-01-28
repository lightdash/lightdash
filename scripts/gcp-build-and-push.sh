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
image="us-east4-docker.pkg.dev/lightdash-cloud-beta/lightdash-commercial/lightdash-commercial"

echo "Building with tags: $version-commercial, beta, $timestamp"

gcloud auth configure-docker us-east4-docker.pkg.dev

docker build . -t "$image:beta" -t "$image:$timestamp" -t "$image:$version-commercial"

for tag in "$version-commercial" "beta" "$timestamp"; do
    docker push "$image:$tag"
done

# Delete images to avoid filling up disk space
for tag in "$version-commercial" "beta" "$timestamp"; do
    docker image rm "$image:$tag"
done
