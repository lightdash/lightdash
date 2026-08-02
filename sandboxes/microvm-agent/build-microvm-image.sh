#!/usr/bin/env bash
#
# Build a Lambda MicroVM image for the Lightdash sandbox provider
# (SANDBOX_PROVIDER=lambda-microvm), reusing the already-built local Docker
# sandbox image rather than rebuilding the npm/dbt stack inside Lambda's ~7.2 GB
# build env (the validated Phase-B pattern — see SandboxRuntime/LAMBDA_MICROVM_PLAN.md §0).
#
# Pipeline:
#   1. Ensure the local Docker image exists (build via the sibling build-local-image.sh).
#   2. Ensure AWS prerequisites exist (ECR repo, build IAM role, S3 staging bucket).
#   3. Push the local arm64 image to ECR (MicroVMs are Graviton/ARM_64 only).
#   4. Assemble a thin `FROM <ecr-image>` + agent Dockerfile, zip it with agent.js,
#      upload to S3.
#   5. create-or-update the MicroVM image (4 GB/16 GB tier, /ready hook on 8080).
#   6. Poll the build to a terminal state, mark the version ACTIVE.
#   7. Print the image ARN to feed LAMBDA_MICROVM_DATA_APP_IMAGE_ARN /
#      LAMBDA_MICROVM_AI_WRITEBACK_IMAGE_ARN.
#
# Usage: ./build-microvm-image.sh <data-app|writeback> [local-image-tag]
set -euo pipefail
cd "$(dirname "$0")"

FEATURE="${1:-}"
if [[ "$FEATURE" != "data-app" && "$FEATURE" != "writeback" ]]; then
    echo "usage: $0 <data-app|writeback> [local-image-tag]" >&2
    exit 1
fi

# ---- Config (override via env) ----------------------------------------------
REGION="${LAMBDA_MICROVM_REGION:-eu-west-1}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REPO="${LD_MICROVM_ECR_REPO:-lightdash-sandbox-microvm}"
BUILD_ROLE_NAME="${LD_MICROVM_BUILD_ROLE:-lightdash-microvm-build-role}"
STAGING_BUCKET="${LD_MICROVM_STAGING_BUCKET:-lightdash-microvm-build-${ACCOUNT_ID}-${REGION}}"
MEM_MIB="${LD_MICROVM_MEM_MIB:-4096}" # 4 GB baseline => 16 GB disk, 2 vCPU
READY_TIMEOUT="${LD_MICROVM_READY_TIMEOUT:-300}"

if [[ "$FEATURE" == "data-app" ]]; then
    LOCAL_TAG="${2:-lightdash-sandbox:local}"
    LOCAL_DIR="../data-apps"
    ECR_TAG="data-app"
    IMAGE_NAME="lightdash-data-app-microvm"
    HOME_DIR="/app"
else
    LOCAL_TAG="${2:-lightdash-ai-writeback:local}"
    LOCAL_DIR="../ai-writeback"
    ECR_TAG="writeback"
    IMAGE_NAME="lightdash-ai-writeback-microvm"
    HOME_DIR="/home/user"
fi

ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:${ECR_TAG}"

log() { echo "[build-microvm-image:${FEATURE}] $*"; }

# ---- 1. Local Docker image --------------------------------------------------
if ! docker image inspect "$LOCAL_TAG" >/dev/null 2>&1; then
    log "local image $LOCAL_TAG missing — building via $LOCAL_DIR/build-local-image.sh"
    (cd "$LOCAL_DIR" && ./build-local-image.sh "$LOCAL_TAG")
fi

# ---- 2. AWS prerequisites (idempotent) --------------------------------------
ensure_ecr() {
    aws ecr describe-repositories --region "$REGION" --repository-names "$ECR_REPO" \
        >/dev/null 2>&1 ||
        aws ecr create-repository --region "$REGION" --repository-name "$ECR_REPO" \
            --image-scanning-configuration scanOnPush=true >/dev/null
}

ensure_bucket() {
    if ! aws s3api head-bucket --bucket "$STAGING_BUCKET" >/dev/null 2>&1; then
        aws s3api create-bucket --bucket "$STAGING_BUCKET" --region "$REGION" \
            --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
    fi
}

ensure_build_role() {
    if aws iam get-role --role-name "$BUILD_ROLE_NAME" >/dev/null 2>&1; then
        BUILD_ROLE_ARN="$(aws iam get-role --role-name "$BUILD_ROLE_NAME" --query Role.Arn --output text)"
        return
    fi
    log "creating build role $BUILD_ROLE_NAME"
    local trust principal
    principal="${LD_MICROVM_BUILD_PRINCIPAL:-lambda.amazonaws.com}"
    trust="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"${principal}\"},\"Action\":[\"sts:AssumeRole\",\"sts:TagSession\"]}]}"
    BUILD_ROLE_ARN="$(aws iam create-role --role-name "$BUILD_ROLE_NAME" \
        --assume-role-policy-document "$trust" --query Role.Arn --output text)"
    # Build needs to pull the base ECR image, read the staged zip, and write its
    # CloudWatch build logs.
    aws iam put-role-policy --role-name "$BUILD_ROLE_NAME" \
        --policy-name lightdash-microvm-build \
        --policy-document "{
            \"Version\":\"2012-10-17\",
            \"Statement\":[
                {\"Effect\":\"Allow\",\"Action\":[\"ecr:GetAuthorizationToken\"],\"Resource\":\"*\"},
                {\"Effect\":\"Allow\",\"Action\":[\"ecr:BatchGetImage\",\"ecr:GetDownloadUrlForLayer\",\"ecr:BatchCheckLayerAvailability\"],\"Resource\":\"arn:aws:ecr:${REGION}:${ACCOUNT_ID}:repository/${ECR_REPO}\"},
                {\"Effect\":\"Allow\",\"Action\":[\"s3:GetObject\"],\"Resource\":\"arn:aws:s3:::${STAGING_BUCKET}/*\"},
                {\"Effect\":\"Allow\",\"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],\"Resource\":\"arn:aws:logs:${REGION}:${ACCOUNT_ID}:*\"}
            ]
        }" >/dev/null
    log "waiting for IAM role propagation"
    sleep 12
}

ensure_ecr
ensure_bucket
ensure_build_role

# ---- 3. Push local image to ECR (arm64) -------------------------------------
log "pushing $LOCAL_TAG -> $ECR_URI"
aws ecr get-login-password --region "$REGION" |
    docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com" >/dev/null
docker tag "$LOCAL_TAG" "$ECR_URI"
docker push "$ECR_URI" >/dev/null
log "pushed $ECR_URI"

# ---- 4. Thin MicroVM Dockerfile + zip + S3 ----------------------------------
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp agent.js "$WORK/agent.js"
cat >"$WORK/Dockerfile" <<DOCKERFILE
FROM ${ECR_URI}
COPY agent.js /opt/agent/agent.js
ENV HOME=${HOME_DIR}
# The agent binds 8080 and answers /ready, so Lambda snapshots only once it is
# listening (the build /ready hook). node resolves via PATH on both base images.
ENTRYPOINT ["node", "/opt/agent/agent.js"]
DOCKERFILE

ZIP="$WORK/context.zip"
(cd "$WORK" && zip -q "$ZIP" Dockerfile agent.js)
S3_KEY="microvm-build/${IMAGE_NAME}/$(date +%s).zip"
aws s3 cp "$ZIP" "s3://${STAGING_BUCKET}/${S3_KEY}" >/dev/null
S3_URI="s3://${STAGING_BUCKET}/${S3_KEY}"
log "staged build context at $S3_URI"

# ---- 5. Base image ARN + create/update image --------------------------------
BASE_IMAGE_ARN="${LD_MICROVM_BASE_IMAGE_ARN:-}"
if [[ -z "$BASE_IMAGE_ARN" ]]; then
    BASE_IMAGE_ARN="$(aws lambda-microvms list-managed-microvm-images --region "$REGION" \
        --query "items[?contains(name, 'al2023')].imageArn | [0]" --output text 2>/dev/null || true)"
fi
if [[ -z "$BASE_IMAGE_ARN" || "$BASE_IMAGE_ARN" == "None" ]]; then
    BASE_IMAGE_ARN="arn:aws:lambda:${REGION}:aws:microvm-image:al2023-1"
fi
log "base image: $BASE_IMAGE_ARN"

REQUEST_JSON="$WORK/request.json"
cat >"$REQUEST_JSON" <<JSON
{
    "baseImageArn": "${BASE_IMAGE_ARN}",
    "buildRoleArn": "${BUILD_ROLE_ARN}",
    "name": "${IMAGE_NAME}",
    "description": "Lightdash ${FEATURE} sandbox (exec agent on 8080)",
    "codeArtifact": { "uri": "${S3_URI}" },
    "cpuConfigurations": [ { "architecture": "ARM_64" } ],
    "resources": [ { "minimumMemoryInMiB": ${MEM_MIB} } ],
    "hooks": {
        "port": 8080,
        "microvmImageHooks": { "ready": "ENABLED", "readyTimeoutInSeconds": ${READY_TIMEOUT} }
    }
}
JSON

EXISTING_ARN="$(aws lambda-microvms list-microvm-images --region "$REGION" \
    --query "items[?name=='${IMAGE_NAME}'].imageArn | [0]" --output text 2>/dev/null || true)"

if [[ -n "$EXISTING_ARN" && "$EXISTING_ARN" != "None" ]]; then
    log "updating existing image $EXISTING_ARN (new version)"
    # update reuses the same name; pass the image identifier + new code artifact.
    python3 - "$REQUEST_JSON" "$EXISTING_ARN" <<'PY'
import json, sys
req = json.load(open(sys.argv[1]))
req.pop("name", None)
req.pop("baseImageArn", None)
req["imageIdentifier"] = sys.argv[2]
json.dump(req, open(sys.argv[1], "w"))
PY
    aws lambda-microvms update-microvm-image --region "$REGION" \
        --cli-input-json "file://${REQUEST_JSON}" >"$WORK/create.json"
    IMAGE_ARN="$EXISTING_ARN"
else
    aws lambda-microvms create-microvm-image --region "$REGION" \
        --cli-input-json "file://${REQUEST_JSON}" >"$WORK/create.json"
    IMAGE_ARN="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["imageArn"])' "$WORK/create.json")"
fi
log "image: $IMAGE_ARN"

# ---- 6. Poll image build to a terminal state --------------------------------
# The image state goes CREATING/UPDATING -> CREATED/UPDATED (success, with
# latestActiveImageVersion set) or *_FAILED (with latestFailedImageVersion).
log "waiting for image build (typically ~3-4 min for the heavy image)…"
DEADLINE=$(( $(date +%s) + 1200 ))
VERSION=""
while :; do
    INFO="$(aws lambda-microvms get-microvm-image --region "$REGION" \
        --image-identifier "$IMAGE_ARN" 2>/dev/null || echo '{}')"
    read -r STATE VERSION FAILED < <(echo "$INFO" | python3 -c '
import json, sys
d = json.load(sys.stdin)
print(d.get("state", "?"), d.get("latestActiveImageVersion", "") or "-", d.get("latestFailedImageVersion", "") or "-")
')
    log "imageState=${STATE} activeVersion=${VERSION} failedVersion=${FAILED}"
    case "$STATE" in
        CREATED|UPDATED) break ;;
        CREATE_FAILED|UPDATE_FAILED)
            log "image build FAILED (version ${FAILED})"
            aws lambda-microvms get-microvm-image-version --region "$REGION" \
                --image-identifier "$IMAGE_ARN" --image-version "$FAILED" \
                --query '{state:state,reason:stateReason}' --output json || true
            exit 1 ;;
    esac
    if (( $(date +%s) > DEADLINE )); then log "timed out waiting for build"; exit 1; fi
    sleep 15
done

# The first successful version is published ACTIVE automatically; ensure it.
aws lambda-microvms update-microvm-image-version --region "$REGION" \
    --image-identifier "$IMAGE_ARN" --image-version "$VERSION" --status ACTIVE \
    >/dev/null 2>&1 || true

echo
echo "============================================================"
echo "MicroVM image ready: $IMAGE_ARN"
echo "  version: $VERSION"
if [[ "$FEATURE" == "data-app" ]]; then
    echo "  export LAMBDA_MICROVM_DATA_APP_IMAGE_ARN=$IMAGE_ARN"
else
    echo "  export LAMBDA_MICROVM_AI_WRITEBACK_IMAGE_ARN=$IMAGE_ARN"
fi
echo "============================================================"
