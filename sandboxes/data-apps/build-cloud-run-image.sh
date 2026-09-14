#!/usr/bin/env bash
# Usage: ./build-cloud-run-image.sh <image-tag> [docker buildx build options...]
set -euo pipefail

if [ "$#" -eq 0 ]; then
    echo "Usage: $0 <image-tag> [docker buildx build options...]" >&2
    exit 1
fi
IMAGE="$1"
shift
cd "$(dirname "$0")"

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

bash ./pack-query-sdk.sh "$STAGE"
cp -R template "$STAGE/"
npm pack @computesdk/cloud-run@0.1.8 --ignore-scripts --pack-destination "$STAGE" >/dev/null
tar -xzf "$STAGE/computesdk-cloud-run-0.1.8.tgz" \
    -C "$STAGE" package/dist/gateway.mjs
mv "$STAGE/package/dist/gateway.mjs" "$STAGE/gateway.mjs"

sed 's|^RUN chown -R user:user /app|RUN useradd -m -s /bin/bash user \&\& chown -R user:user /app|' \
    e2b.Dockerfile > "$STAGE/Dockerfile"
cat >> "$STAGE/Dockerfile" <<'EOF'

COPY gateway.mjs /gateway/gateway.mjs
ENV NODE_ENV=production
CMD ["node", "/gateway/gateway.mjs"]
EOF

docker buildx build --platform linux/amd64 -t "$IMAGE" "$@" "$STAGE"
