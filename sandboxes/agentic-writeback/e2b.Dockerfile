FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
        build-essential \
        gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
        dbt-core \
        dbt-bigquery \
        dbt-snowflake \
        dbt-postgres \
        dbt-duckdb

RUN npm install -g @anthropic-ai/claude-code

# pnpm for installing the Lightdash CLI
ENV PNPM_HOME="/usr/local/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"
RUN npm install -g pnpm@10.33.0 \
    && pnpm add -g @lightdash/cli

WORKDIR /home/user
