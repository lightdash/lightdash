# syntax=docker/dockerfile:1.7
# -----------------------------
# Lightdash Base Image
# Contains: System dependencies, pnpm, and all dbt versions (1.4-1.10)
# -----------------------------

FROM node:20-bookworm-slim

# Set up pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm i -g corepack@latest
RUN corepack enable
RUN corepack prepare pnpm@9.15.5 --activate
RUN pnpm config set store-dir /pnpm/store

WORKDIR /usr/app

# Install system dependencies
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    git \
    libcairo2-dev \
    libgnutls28-dev  \
    libpango1.0-dev \
    librsvg2-dev \
    libsasl2-modules-gssapi-mit \
    libsystemd0 \
    python3 \
    python3-dev \
    python3-psycopg2 \
    python3-venv \
    software-properties-common \
    tar \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install multiple versions of dbt with cache mounts for faster rebuilds
# dbt 1.4 is the default
RUN --mount=type=cache,id=pip-dbt,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /usr/local/dbt1.4 \
    && /usr/local/dbt1.4/bin/pip install \
    "dbt-postgres~=1.4.0" \
    "dbt-redshift~=1.4.0" \
    "dbt-snowflake~=1.4.0" \
    "dbt-bigquery~=1.4.0" \
    "dbt-databricks~=1.4.0" \
    "dbt-trino~=1.4.0" \
    "dbt-clickhouse~=1.4.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.4/bin/dbt /usr/local/bin/dbt

RUN --mount=type=cache,id=pip-dbt,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /usr/local/dbt1.5 \
    && /usr/local/dbt1.5/bin/pip install \
    "dbt-postgres~=1.5.0" \
    "dbt-redshift~=1.5.0" \
    "dbt-snowflake~=1.5.0" \
    "dbt-bigquery~=1.5.0" \
    "dbt-databricks~=1.5.0" \
    "dbt-trino==1.5.0" \
    "dbt-clickhouse~=1.5.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.5/bin/dbt /usr/local/bin/dbt1.5

RUN --mount=type=cache,id=pip-dbt,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /usr/local/dbt1.6 \
    && /usr/local/dbt1.6/bin/pip install \
    "dbt-postgres~=1.6.0" \
    "dbt-redshift~=1.6.0" \
    "dbt-snowflake~=1.6.0" \
    "dbt-bigquery~=1.6.0" \
    "dbt-databricks~=1.6.0" \
    "dbt-trino==1.6.0" \
    "dbt-clickhouse~=1.6.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.6/bin/dbt /usr/local/bin/dbt1.6

RUN --mount=type=cache,id=pip-dbt,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /usr/local/dbt1.7 \
    && /usr/local/dbt1.7/bin/pip install \
    "dbt-postgres~=1.7.0" \
    "dbt-redshift~=1.7.0" \
    "dbt-snowflake~=1.7.0" \
    "dbt-bigquery~=1.7.0" \
    "dbt-databricks~=1.7.0" \
    "dbt-trino==1.7.0" \
    "dbt-clickhouse~=1.7.0" \
    "psycopg2-binary==2.9.6" \
    && ln -s /usr/local/dbt1.7/bin/dbt /usr/local/bin/dbt1.7

RUN --mount=type=cache,id=pip-dbt,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /usr/local/dbt1.8 \
    && /usr/local/dbt1.8/bin/pip install \
    "dbt-core~=1.8.0" \
    "dbt-postgres~=1.8.0" \
    "dbt-redshift~=1.8.0" \
    "dbt-snowflake~=1.8.0" \
    "dbt-bigquery~=1.8.0" \
    "dbt-databricks~=1.8.0" \
    "dbt-trino~=1.8.0" \
    "dbt-clickhouse~=1.8.0" \
    && ln -s /usr/local/dbt1.8/bin/dbt /usr/local/bin/dbt1.8

RUN --mount=type=cache,id=pip-dbt,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /usr/local/dbt1.9 \
    && /usr/local/dbt1.9/bin/pip install \
    "dbt-core~=1.9.0" \
    "dbt-postgres~=1.9.0" \
    "dbt-redshift~=1.9.0" \
    "dbt-snowflake~=1.9.0" \
    "dbt-bigquery~=1.9.0" \
    "dbt-databricks~=1.9.0" \
    "dbt-trino~=1.9.0" \
    "dbt-clickhouse~=1.9.0" \
    && ln -s /usr/local/dbt1.9/bin/dbt /usr/local/bin/dbt1.9

RUN --mount=type=cache,id=pip-dbt,target=/root/.cache/pip,sharing=locked \
    python3 -m venv /usr/local/dbt1.10 \
    && /usr/local/dbt1.10/bin/pip install \
    "dbt-core~=1.10.0" \
    "dbt-postgres~=1.9.0" \
    "dbt-redshift~=1.9.0" \
    "dbt-snowflake~=1.9.0" \
    "dbt-bigquery~=1.9.0" \
    "dbt-databricks~=1.10.0" \
    "dbt-trino~=1.9.0" \
    "dbt-clickhouse~=1.9.0" \
    && ln -s /usr/local/dbt1.10/bin/dbt /usr/local/bin/dbt1.10

# Add labels for metadata
LABEL description="Base image for Lightdash with dbt 1.4-1.10"
LABEL org.opencontainers.image.source="https://github.com/lightdash/lightdash"
