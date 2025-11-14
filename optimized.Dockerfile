# syntax=docker/dockerfile:1

# -----------------------------
# Stage 0: Use pre-built base image
# Contains: node, pnpm, system deps, and all dbt versions (1.4-1.10)
# To build base image: docker build -f base.Dockerfile -t lightdash-base-local .
# To use local base: `docker build --build-arg BASE_IMAGE=lightdash-base-local -f optimized.Dockerfile .`
# -----------------------------
ARG BASE_IMAGE=us-docker.pkg.dev/lightdash-containers/lightdash-base/base-image:v1
FROM ${BASE_IMAGE} AS base

WORKDIR /usr/app

# -----------------------------
# Stage 1: Development environment
# -----------------------------
FROM base AS dev

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && apt-get clean

EXPOSE 3000
EXPOSE 8080

# -----------------------------
# Stage 2: Dependency installation for production build
# -----------------------------
FROM base AS deps

# Sentry build args (declared early to avoid cache invalidation)
ARG SENTRY_AUTH_TOKEN=""
ARG SENTRY_ORG=""
ARG SENTRY_RELEASE_VERSION=""
ARG SENTRY_FRONTEND_PROJECT=""
ARG SENTRY_BACKEND_PROJECT=""
ARG SENTRY_ENVIRONMENT=""

# Install Sentry CLI if environment variables are set
RUN if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ]; then \
    npm install -g @sentry/cli; \
    fi

# Copy only package manifests first (better caching - only invalidated on dependency changes)
# Breaking them up like this allows docker to better cache layers when only one package's dependencies change
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.json .eslintrc.js .pnpmfile.cjs ./
COPY packages/common/package.json ./packages/common/
COPY packages/warehouses/package.json ./packages/warehouses/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies with cache mount (invalidated only when package.json changes)
RUN --mount=type=cache,id=pnpm-all,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# -----------------------------
# Stage 3a: Build common package (required by all others)
# -----------------------------
FROM deps AS build-common

# Increase Node.js heap size for TypeScript compilation
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Copy and build common package
COPY packages/common/tsconfig.json ./packages/common/
COPY packages/common/tsconfig.build.json ./packages/common/
COPY packages/common/tsconfig.esm.json ./packages/common/
COPY packages/common/tsconfig.cjs.json ./packages/common/
COPY packages/common/tsconfig.types.json ./packages/common/
COPY packages/common/src/ ./packages/common/src/

RUN pnpm -F @lightdash/common build

# -----------------------------
# Stage 3b: Build warehouses package (required by backend)
# -----------------------------
FROM build-common AS build-warehouses

COPY packages/warehouses/tsconfig.json ./packages/warehouses/
COPY packages/warehouses/src/ ./packages/warehouses/src/

RUN pnpm -F @lightdash/warehouses build

# -----------------------------
# Stage 3c: Build backend package (depends on warehouses)
# -----------------------------
FROM build-warehouses AS build-backend

COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/tsconfig.sentry.json ./packages/backend/
COPY packages/backend/src/ ./packages/backend/src

# Conditionally build backend with sourcemaps if Sentry environment variables are set
RUN if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ] && [ -n "${SENTRY_FRONTEND_PROJECT}" ] && [ -n "${SENTRY_BACKEND_PROJECT}" ] && [ -n "${SENTRY_ENVIRONMENT}" ]; then \
    echo "Building backend with sourcemaps for Sentry"; \
    pnpm -F backend build-sourcemaps && pnpm -F backend postbuild; \
    else \
    echo "Building backend without sourcemaps"; \
    pnpm -F backend build; \
    fi

# -----------------------------
# Stage 3d: Build frontend package (builds in parallel with warehouses+backend chain)
# -----------------------------
FROM build-common AS build-frontend

COPY packages/frontend ./packages/frontend

RUN if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ]; then \
    echo "Building frontend with Sentry integration"; \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} SENTRY_RELEASE_VERSION=${SENTRY_RELEASE_VERSION} pnpm -F frontend build; \
    else \
    echo "Building frontend without Sentry integration"; \
    pnpm -F frontend build; \
    fi


# -----------------------------
# Stage 4: Production dependencies
# -----------------------------
FROM deps AS prod-deps

# Install only production dependencies (separate cache ID)
ENV NODE_ENV production
RUN --mount=type=cache,id=pnpm-prod,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --prefer-offline

# -----------------------------
# Stage 5: Production runtime image
# -----------------------------
FROM base as prod
# Note: base image already includes:
# - node, pnpm, corepack
# - All system dependencies (python3, git, build-essential, cairo, pango, etc.)
# - All dbt versions (1.4-1.10) in /usr/local/dbt*

ENV NODE_ENV production

# COMMENTED: Already in base image
# ENV PATH="$PNPM_HOME:$PATH"
# RUN npm i -g corepack@latest
# RUN corepack enable
# RUN corepack prepare pnpm@9.15.5 --activate
# RUN pnpm config set store-dir /pnpm/store

WORKDIR /usr/app

# Install only runtime-specific packages not in base
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    && apt-get clean

# Note: Runtime libraries (libcairo2, libpango-1.0-0, librsvg2-2) are already
# included as dependencies of the -dev packages in base image

# COMMENTED: Already in base image (these packages are in base.Dockerfile)
# RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
#     --mount=type=cache,target=/var/lib/apt,sharing=locked \
#     apt-get update && apt-get install -y --no-install-recommends \
#     python3 \
#     python3-psycopg2 \
#     python3-venv \
#     git \
#     build-essential \
#     libcairo2-dev \
#     libpango1.0-dev \
#     librsvg2-dev \
#     && apt-get clean

# COMMENTED: dbt already in base image, inherited automatically
# COPY --from=base /usr/local/dbt1.4 /usr/local/dbt1.4
# COPY --from=base /usr/local/dbt1.5 /usr/local/dbt1.5
# COPY --from=base /usr/local/dbt1.6 /usr/local/dbt1.6
# COPY --from=base /usr/local/dbt1.7 /usr/local/dbt1.7
# COPY --from=base /usr/local/dbt1.8 /usr/local/dbt1.8
# COPY --from=base /usr/local/dbt1.9 /usr/local/dbt1.9
# COPY --from=base /usr/local/dbt1.10 /usr/local/dbt1.10

# Copy production dependencies
COPY --from=prod-deps /usr/app/node_modules /usr/app/node_modules
COPY --from=prod-deps /usr/app/packages/common/node_modules /usr/app/packages/common/node_modules
COPY --from=prod-deps /usr/app/packages/warehouses/node_modules /usr/app/packages/warehouses/node_modules
COPY --from=prod-deps /usr/app/packages/backend/node_modules /usr/app/packages/backend/node_modules
COPY --from=prod-deps /usr/app/packages/frontend/node_modules /usr/app/packages/frontend/node_modules

# Copy built artifacts directly from parallel build stages (no intermediate builder stage)
COPY --from=build-common /usr/app/packages/common/dist /usr/app/packages/common/dist
COPY --from=build-warehouses /usr/app/packages/warehouses/dist /usr/app/packages/warehouses/dist
COPY --from=build-backend /usr/app/packages/backend/dist /usr/app/packages/backend/dist
COPY --from=build-frontend /usr/app/packages/frontend/build /usr/app/packages/frontend/build

# Copy package.json files needed for runtime (from deps stage where they were originally copied)
COPY --from=deps /usr/app/package.json /usr/app/
COPY --from=deps /usr/app/packages/common/package.json /usr/app/packages/common/
COPY --from=deps /usr/app/packages/warehouses/package.json /usr/app/packages/warehouses/
COPY --from=deps /usr/app/packages/backend/package.json /usr/app/packages/backend/
COPY --from=deps /usr/app/packages/frontend/package.json /usr/app/packages/frontend/

# Process and upload sourcemaps to Sentry if environment variables are set
RUN if [ -n "${SENTRY_AUTH_TOKEN}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ] && [ -n "${SENTRY_FRONTEND_PROJECT}" ] && [ -n "${SENTRY_BACKEND_PROJECT}" ] && [ -n "${SENTRY_ENVIRONMENT}" ]; then \
    echo "Creating Sentry releases and processing sourcemaps"; \
    sentry-cli releases new "${SENTRY_RELEASE_VERSION}" --project "${SENTRY_FRONTEND_PROJECT}"; \
    sentry-cli releases new "${SENTRY_RELEASE_VERSION}" --project "${SENTRY_BACKEND_PROJECT}"; \
    sentry-cli releases set-commits "${SENTRY_RELEASE_VERSION}" --auto || echo "Could not determine commits automatically"; \
    echo "Injecting debug IDs into frontend artifacts"; \
    sentry-cli sourcemaps inject ./packages/frontend/build/assets/; \
    echo "Uploading frontend sourcemaps"; \
    sentry-cli sourcemaps upload --release "${SENTRY_RELEASE_VERSION}" \
    --url-prefix "~/assets" ./packages/frontend/build/assets/ --project "${SENTRY_FRONTEND_PROJECT}"; \
    echo "Injecting debug IDs into backend artifacts"; \
    sentry-cli sourcemaps inject ./packages/backend/dist/; \
    echo "Uploading backend sourcemaps"; \
    sentry-cli sourcemaps upload --release "${SENTRY_RELEASE_VERSION}" \
    --url-prefix "~/" ./packages/backend/dist/ --project "${SENTRY_BACKEND_PROJECT}"; \
    sentry-cli releases finalize "${SENTRY_RELEASE_VERSION}"; \
    sentry-cli releases deploys "${SENTRY_RELEASE_VERSION}" new -e "${SENTRY_ENVIRONMENT}" --project "${SENTRY_FRONTEND_PROJECT}"; \
    sentry-cli releases deploys "${SENTRY_RELEASE_VERSION}" new -e "${SENTRY_ENVIRONMENT}" --project "${SENTRY_BACKEND_PROJECT}"; \
    else \
    echo "Sentry upload skipped (missing environment variables)"; \
    fi

# COMMENTED: dbt symlinks already created in base image
# RUN ln -s /usr/local/dbt1.4/bin/dbt /usr/local/bin/dbt \
#     && ln -s /usr/local/dbt1.5/bin/dbt /usr/local/bin/dbt1.5 \
#     && ln -s /usr/local/dbt1.6/bin/dbt /usr/local/bin/dbt1.6 \
#     && ln -s /usr/local/dbt1.7/bin/dbt /usr/local/bin/dbt1.7 \
#     && ln -s /usr/local/dbt1.8/bin/dbt /usr/local/bin/dbt1.8 \
#     && ln -s /usr/local/dbt1.9/bin/dbt /usr/local/bin/dbt1.9 \
#     && ln -s /usr/local/dbt1.10/bin/dbt /usr/local/bin/dbt1.10

# Run backend
COPY ./docker/prod-entrypoint.sh /usr/bin/prod-entrypoint.sh

EXPOSE 8080

WORKDIR /usr/app/packages/backend

ENTRYPOINT ["dumb-init", "--", "/usr/bin/prod-entrypoint.sh"]
CMD ["node", "dist/index.js"]

# -----------------------------
# PR Stage: PR runner with demo data
# -----------------------------
FROM prod AS pr-runner

# Copy demo dbt project for E2E testing
COPY ./examples/full-jaffle-shop-demo/renderDeployHook.sh /usr/bin/renderDeployHook.sh
COPY ./examples/full-jaffle-shop-demo/dbt /usr/app/dbt
COPY ./examples/full-jaffle-shop-demo/profiles /usr/app/profiles

RUN chmod +x /usr/bin/renderDeployHook.sh