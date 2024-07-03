# -----------------------------
# Stage 0: install dependencies
# -----------------------------
FROM node:20-bookworm-slim AS base
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
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Fix package vulnerabilities 
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgnutls28-dev  \
    tar \ 
    libsystemd0

# Installing multiple versions of dbt
# dbt 1.4 is the default
RUN python3 -m venv /usr/local/dbt1.4 \
    && /usr/local/dbt1.4/bin/pip install \
    "dbt-postgres~=1.4.0" \
    "dbt-redshift~=1.4.0" \
    "dbt-snowflake~=1.4.0" \
    "dbt-bigquery~=1.4.0" \
    "dbt-databricks~=1.4.0" \
    "dbt-trino~=1.4.0" \
    "psycopg2-binary==2.9.6"

RUN ln -s /usr/local/dbt1.4/bin/dbt /usr/local/bin/dbt\
    && python3 -m venv /usr/local/dbt1.5 \
    && /usr/local/dbt1.5/bin/pip install \
    "dbt-postgres~=1.5.0" \
    "dbt-redshift~=1.5.0" \
    "dbt-snowflake~=1.5.0" \
    "dbt-bigquery~=1.5.0" \
    "dbt-databricks~=1.5.0" \
    "dbt-trino==1.5.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.5/bin/dbt /usr/local/bin/dbt1.5\
    && python3 -m venv /usr/local/dbt1.6 \
    && /usr/local/dbt1.6/bin/pip install \
    "dbt-postgres~=1.6.0" \
    "dbt-redshift~=1.6.0" \
    "dbt-snowflake~=1.6.0" \
    "dbt-bigquery~=1.6.0" \
    "dbt-databricks~=1.6.0" \
    "dbt-trino==1.6.0" \
    "psycopg2-binary==2.9.6"\
    && ln -s /usr/local/dbt1.6/bin/dbt /usr/local/bin/dbt1.6 \
    && python3 -m venv /usr/local/dbt1.7 \
    && /usr/local/dbt1.7/bin/pip install \
    "dbt-postgres~=1.7.0" \
    "dbt-redshift~=1.7.0" \
    "dbt-snowflake~=1.7.0" \
    "dbt-bigquery~=1.7.0" \
    "dbt-databricks~=1.7.0" \
    "dbt-trino==1.7.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.7/bin/dbt /usr/local/bin/dbt1.7 \
    && python3 -m venv /usr/local/dbt1.8 \
    && /usr/local/dbt1.8/bin/pip install \
    # from 1.8, dbt-core needs to be explicitly installed
    "dbt-core~=1.8.0" \
    # regression (https://github.com/dbt-labs/dbt-postgres/issues/96)
    # "dbt-postgres~=1.8.0" \
    # "dbt-redshift~=1.8.0" \
    "dbt-snowflake~=1.8.0" \
    "dbt-bigquery~=1.8.0" \
    # databricks adaptor not available yet
    # "dbt-databricks~=1.8.0" \
    "dbt-trino~=1.8.0" \
    && ln -s /usr/local/dbt1.8/bin/dbt /usr/local/bin/dbt1.8

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
COPY yarn.lock .
COPY tsconfig.json .
COPY .eslintrc.js .
COPY packages/common/package.json ./packages/common/
COPY packages/warehouses/package.json ./packages/warehouses/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN yarn install --pure-lockfile --non-interactive

# Build common
COPY packages/common/tsconfig.json ./packages/common/
COPY packages/common/src/ ./packages/common/src/
RUN yarn --cwd ./packages/common/ build

# Build warehouses
COPY packages/warehouses/tsconfig.json ./packages/warehouses/
COPY packages/warehouses/src/ ./packages/warehouses/src/
RUN yarn --cwd ./packages/warehouses/ build

# Build backend
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/src/ ./packages/backend/src
RUN yarn --cwd ./packages/backend/ build

# Build frontend
COPY packages/frontend ./packages/frontend
RUN yarn --cwd ./packages/frontend/ build

# Cleanup development dependencies
RUN rm -rf node_modules \
    && rm -rf packages/*/node_modules

# Install production dependencies
ENV NODE_ENV production
RUN yarn install --pure-lockfile --non-interactive --production

# -----------------------------
# Stage 3: execution environment for backend
# -----------------------------

FROM node:20-bookworm-slim as prod
WORKDIR /usr/app

ENV NODE_ENV production

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-psycopg2 \
    python3-venv \
    git \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-builder  /usr/local/dbt1.4 /usr/local/dbt1.4
COPY --from=prod-builder  /usr/local/dbt1.5 /usr/local/dbt1.5
COPY --from=prod-builder  /usr/local/dbt1.6 /usr/local/dbt1.6
COPY --from=prod-builder  /usr/local/dbt1.7 /usr/local/dbt1.7
COPY --from=prod-builder  /usr/local/dbt1.8 /usr/local/dbt1.8
COPY --from=prod-builder /usr/app /usr/app

RUN ln -s /usr/local/dbt1.4/bin/dbt /usr/local/bin/dbt \
    && ln -s /usr/local/dbt1.5/bin/dbt /usr/local/bin/dbt1.5 \
    && ln -s /usr/local/dbt1.6/bin/dbt /usr/local/bin/dbt1.6 \
    && ln -s /usr/local/dbt1.7/bin/dbt /usr/local/bin/dbt1.7 \
    && ln -s /usr/local/dbt1.8/bin/dbt /usr/local/bin/dbt1.8


# Production config
COPY lightdash.yml /usr/app/lightdash.yml
ENV LIGHTDASH_CONFIG_FILE /usr/app/lightdash.yml

# Copy the docker-compose file
COPY docker-compose.yml /usr/app/docker-compose.yml

# Run backend
COPY ./docker/prod-entrypoint.sh /usr/bin/prod-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/usr/bin/prod-entrypoint.sh"]
CMD ["yarn", "workspace", "backend", "start"]
