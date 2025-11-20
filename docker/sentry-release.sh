#!/usr/bin/env bash
set -euo pipefail

echo "Checking Sentry configuration..."

required_env_vars=(
    "SENTRY_AUTH_TOKEN"
    "SENTRY_ORG"
    "SENTRY_RELEASE_VERSION"
    "SENTRY_FRONTEND_PROJECT"
    "SENTRY_BACKEND_PROJECT"
    "SENTRY_ENVIRONMENT"
)

missing_vars=()
for var_name in "${required_env_vars[@]}"; do
    if [[ -z "${!var_name:-}" ]]; then
        missing_vars+=("$var_name")
    fi
done

if [[ ${#missing_vars[@]} -gt 0 ]]; then
    echo "Skipping Sentry release: missing required env vars: ${missing_vars[*]}"
    exit 0
fi

echo "Creating Sentry releases and processing sourcemaps"

frontend_build_dir="./packages/frontend/build/assets"
backend_build_dir="./packages/backend/dist"

if [[ ! -d "${frontend_build_dir}" ]] || [[ ! -d "${backend_build_dir}" ]]; then
    echo "Expected frontend (${frontend_build_dir}) or backend (${backend_build_dir}) artifacts are missing"
    exit 1
fi

sentry-cli releases new "${SENTRY_RELEASE_VERSION}" --project "${SENTRY_FRONTEND_PROJECT}"
sentry-cli releases new "${SENTRY_RELEASE_VERSION}" --project "${SENTRY_BACKEND_PROJECT}"

sentry-cli releases set-commits "${SENTRY_RELEASE_VERSION}" --auto || echo "Could not determine commits automatically"

echo "Injecting debug IDs into frontend artifacts"
sentry-cli sourcemaps inject "${frontend_build_dir}"

echo "Uploading frontend sourcemaps"
sentry-cli sourcemaps upload \
    --release "${SENTRY_RELEASE_VERSION}" \
    --url-prefix "~/assets" \
    "${frontend_build_dir}" \
    --project "${SENTRY_FRONTEND_PROJECT}"

echo "Injecting debug IDs into backend artifacts"
sentry-cli sourcemaps inject "${backend_build_dir}"

echo "Uploading backend sourcemaps"
sentry-cli sourcemaps upload \
    --release "${SENTRY_RELEASE_VERSION}" \
    --url-prefix "~/" \
    "${backend_build_dir}" \
    --project "${SENTRY_BACKEND_PROJECT}"

sentry-cli releases finalize "${SENTRY_RELEASE_VERSION}"

sentry-cli releases deploys "${SENTRY_RELEASE_VERSION}" new -e "${SENTRY_ENVIRONMENT}" --project "${SENTRY_FRONTEND_PROJECT}"
sentry-cli releases deploys "${SENTRY_RELEASE_VERSION}" new -e "${SENTRY_ENVIRONMENT}" --project "${SENTRY_BACKEND_PROJECT}"

echo "Sentry release completed"
