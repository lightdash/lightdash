ARG DBT_VERSIONS="1.4 1.5 1.6 1.7 1.8 1.9 1.10"
ARG DBT_DEFAULT_VERSION="1.4"
ARG DBT_INSTALL_ROOT="/opt/dbt"

# -----------------------------
# Stage 0: install dependencies
# -----------------------------
FROM node:20-bookworm-slim AS base

ARG DBT_VERSIONS
ARG DBT_DEFAULT_VERSION
ARG DBT_INSTALL_ROOT

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
ENV DBT_INSTALL_ROOT=${DBT_INSTALL_ROOT}
RUN npm i -g corepack@latest
RUN corepack enable
RUN corepack prepare pnpm@9.15.5 --activate
RUN pnpm config set store-dir /pnpm/store

WORKDIR /usr/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    libsasl2-modules-gssapi-mit \
    python3 \
    python3-psycopg2 \
    python3-venv \
    python3-dev \
    software-properties-common \
    unzip \
    git \
    libcairo2-dev \
    libpango1.0-dev \
    librsvg2-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Fix package vulnerabilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgnutls28-dev  \
    tar \
    libsystemd0

RUN install -d "${DBT_INSTALL_ROOT}"

# Installing multiple versions of dbt (configurable via DBT_VERSIONS arg)
RUN set -eux; \
    install_dbt_version() { \
        version="$1"; \
        venv_path="${DBT_INSTALL_ROOT}/${version}"; \
        python3 -m venv "${venv_path}"; \
        pip_bin="${venv_path}/bin/pip"; \
        case "$version" in \
            1.4) \
                "${pip_bin}" install --no-cache-dir \
                    "dbt-postgres~=1.4.0" \
                    "dbt-redshift~=1.4.0" \
                    "dbt-snowflake~=1.4.0" \
                    "dbt-bigquery~=1.4.0" \
                    "dbt-databricks~=1.4.0" \
                    "dbt-trino~=1.4.0" \
                    "dbt-clickhouse~=1.4.0" \
                    "psycopg2-binary==2.9.6"; \
                ;; \
            1.5) \
                "${pip_bin}" install --no-cache-dir \
                    "dbt-postgres~=1.5.0" \
                    "dbt-redshift~=1.5.0" \
                    "dbt-snowflake~=1.5.0" \
                    "dbt-bigquery~=1.5.0" \
                    "dbt-databricks~=1.5.0" \
                    "dbt-trino==1.5.0" \
                    "dbt-clickhouse~=1.5.0" \
                    "psycopg2-binary==2.9.6"; \
                ;; \
            1.6) \
                "${pip_bin}" install --no-cache-dir \
                    "dbt-postgres~=1.6.0" \
                    "dbt-redshift~=1.6.0" \
                    "dbt-snowflake~=1.6.0" \
                    "dbt-bigquery~=1.6.0" \
                    "dbt-databricks~=1.6.0" \
                    "dbt-trino==1.6.0" \
                    "dbt-clickhouse~=1.6.0" \
                    "psycopg2-binary==2.9.6"; \
                ;; \
            1.7) \
                "${pip_bin}" install --no-cache-dir \
                    "dbt-postgres~=1.7.0" \
                    "dbt-redshift~=1.7.0" \
                    "dbt-snowflake~=1.7.0" \
                    "dbt-bigquery~=1.7.0" \
                    "dbt-databricks~=1.7.0" \
                    "dbt-trino==1.7.0" \
                    "dbt-clickhouse~=1.7.0" \
                    "psycopg2-binary==2.9.6"; \
                ;; \
            1.8) \
                "${pip_bin}" install --no-cache-dir \
                    "dbt-core~=1.8.0" \
                    "dbt-postgres~=1.8.0" \
                    "dbt-redshift~=1.8.0" \
                    "dbt-snowflake~=1.8.0" \
                    "dbt-bigquery~=1.8.0" \
                    "dbt-databricks~=1.8.0" \
                    "dbt-trino~=1.8.0" \
                    "dbt-clickhouse~=1.8.0"; \
                ;; \
            1.9) \
                "${pip_bin}" install --no-cache-dir \
                    "dbt-core~=1.9.0" \
                    "dbt-postgres~=1.9.0" \
                    "dbt-redshift~=1.9.0" \
                    "dbt-snowflake~=1.9.0" \
                    "dbt-bigquery~=1.9.0" \
                    "dbt-databricks~=1.9.0" \
                    "dbt-trino~=1.9.0" \
                    "dbt-clickhouse~=1.9.0"; \
                ;; \
            1.10) \
                "${pip_bin}" install --no-cache-dir \
                    "dbt-core~=1.10.0" \
                    "dbt-postgres~=1.9.0" \
                    "dbt-redshift~=1.9.0" \
                    "dbt-snowflake~=1.9.0" \
                    "dbt-bigquery~=1.9.0" \
                    "dbt-databricks~=1.10.0" \
                    "dbt-trino~=1.9.0" \
                    "dbt-clickhouse~=1.9.0"; \
                ;; \
            *) \
                echo "Unsupported dbt version ${version}" >&2; \
                exit 1; \
                ;; \
        esac; \
    }; \
    for version in ${DBT_VERSIONS}; do \
        install_dbt_version "${version}"; \
    done; \
    if ! printf ' %s ' ${DBT_VERSIONS} | grep -q " ${DBT_DEFAULT_VERSION} "; then \
        echo "DBT_DEFAULT_VERSION (${DBT_DEFAULT_VERSION}) must be part of DBT_VERSIONS" >&2; \
        exit 1; \
    fi; \
    ln -sf "${DBT_INSTALL_ROOT}/${DBT_DEFAULT_VERSION}/bin/dbt" /usr/local/bin/dbt; \
    for version in ${DBT_VERSIONS}; do \
        ln -sf "${DBT_INSTALL_ROOT}/${version}/bin/dbt" "/usr/local/bin/dbt${version}"; \
    done

# -----------------------------
# Stage 1: stop here for dev environment
# -----------------------------
FROM base AS dev

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && apt-get clean

EXPOSE 3000
EXPOSE 8080

# -----------------------------
# Stage 2: continue build for production environment
# -----------------------------

FROM base AS prod-builder
# Install development dependencies for all
COPY package.json .
COPY pnpm-workspace.yaml .
COPY pnpm-lock.yaml .
COPY tsconfig.json .
COPY .eslintrc.js .
COPY .pnpmfile.cjs .
COPY packages/common/package.json ./packages/common/
COPY packages/warehouses/package.json ./packages/warehouses/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# Install Sentry CLI if environment variables are set
ARG SENTRY_ORG=""
ARG SENTRY_RELEASE_VERSION=""
ARG SENTRY_FRONTEND_PROJECT=""
ARG SENTRY_BACKEND_PROJECT=""
ARG SENTRY_ENVIRONMENT=""

RUN if [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ]; then \
    npm install -g @sentry/cli; \
    fi

# Build common
COPY packages/common/tsconfig.json ./packages/common/
COPY packages/common/tsconfig.build.json ./packages/common/
COPY packages/common/tsconfig.esm.json ./packages/common/
COPY packages/common/tsconfig.cjs.json ./packages/common/
COPY packages/common/tsconfig.types.json ./packages/common/
COPY packages/common/src/ ./packages/common/src/
RUN pnpm -F @lightdash/common build

# Build warehouses
COPY packages/warehouses/tsconfig.json ./packages/warehouses/
COPY packages/warehouses/src/ ./packages/warehouses/src/
RUN pnpm -F @lightdash/warehouses build

# Build backend
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/tsconfig.sentry.json ./packages/backend/
COPY packages/backend/src/ ./packages/backend/src

# Conditionally build backend with sourcemaps if Sentry release information is available
RUN if [ -n "${SENTRY_RELEASE_VERSION}" ]; then \
    echo "Building backend with sourcemaps for Sentry"; \
    pnpm -F backend build-sourcemaps && pnpm -F backend postbuild; \
    else \
    echo "Building backend without sourcemaps"; \
    pnpm -F backend build; \
    fi

# Build frontend
COPY packages/frontend ./packages/frontend
# Build frontend with sourcemaps (Vite generates them by default)
RUN if [ -n "${SENTRY_RELEASE_VERSION}" ]; then \
    echo "Building frontend with Sentry integration"; \
    SENTRY_RELEASE_VERSION=${SENTRY_RELEASE_VERSION} pnpm -F frontend build; \
    else \
    echo "Building frontend without Sentry integration"; \
    pnpm -F frontend build; \
    fi

COPY docker/sentry-release.sh ./docker/sentry-release.sh

# Process and upload sourcemaps to Sentry if environment variables are set
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    if [ -f /run/secrets/sentry_auth_token ]; then \
        export SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)"; \
    fi; \
    if [ -n "${SENTRY_AUTH_TOKEN:-}" ] && [ -n "${SENTRY_ORG}" ] && [ -n "${SENTRY_RELEASE_VERSION}" ] && [ -n "${SENTRY_FRONTEND_PROJECT}" ] && [ -n "${SENTRY_BACKEND_PROJECT}" ] && [ -n "${SENTRY_ENVIRONMENT}" ]; then \
        echo "Running Sentry release helper script"; \
        bash ./docker/sentry-release.sh; \
    else \
        echo "Skipping Sentry release step (missing Sentry configuration or secret)"; \
    fi

# Cleanup development dependencies
RUN rm -rf node_modules \
    && rm -rf packages/*/node_modules

# Install production dependencies
ENV NODE_ENV=production
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --prefer-offline

# -----------------------------
# Stage 3: execution environment for backend
# -----------------------------

FROM node:20-bookworm-slim AS prod

ARG DBT_VERSIONS
ARG DBT_DEFAULT_VERSION
ARG DBT_INSTALL_ROOT

ENV PNPM_HOME=/pnpm
ENV NODE_ENV=production
ENV PATH="${PNPM_HOME}:${PATH}"
ENV DBT_INSTALL_ROOT=${DBT_INSTALL_ROOT}
RUN npm i -g corepack@latest
RUN corepack enable
RUN corepack prepare pnpm@9.15.5 --activate
RUN pnpm config set store-dir /pnpm/store

WORKDIR /usr/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-psycopg2 \
    python3-venv \
    git \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    librsvg2-dev \
    dumb-init \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-builder ${DBT_INSTALL_ROOT}/ ${DBT_INSTALL_ROOT}
COPY --from=prod-builder /usr/app /usr/app

RUN set -eux; \
    if [ ! -x "${DBT_INSTALL_ROOT}/${DBT_DEFAULT_VERSION}/bin/dbt" ]; then \
        echo "dbt default version ${DBT_DEFAULT_VERSION} has not been installed" >&2; \
        exit 1; \
    fi; \
    ln -sf "${DBT_INSTALL_ROOT}/${DBT_DEFAULT_VERSION}/bin/dbt" /usr/local/bin/dbt; \
    for version in ${DBT_VERSIONS}; do \
        if [ -x "${DBT_INSTALL_ROOT}/${version}/bin/dbt" ]; then \
            ln -sf "${DBT_INSTALL_ROOT}/${version}/bin/dbt" "/usr/local/bin/dbt${version}"; \
        fi; \
    done


# Run backend
COPY ./docker/prod-entrypoint.sh /usr/bin/prod-entrypoint.sh

EXPOSE 8080

WORKDIR /usr/app/packages/backend

ENTRYPOINT ["dumb-init", "--", "/usr/bin/prod-entrypoint.sh"]
CMD ["node", "dist/index.js"]
