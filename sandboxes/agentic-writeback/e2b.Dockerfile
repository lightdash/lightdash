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

WORKDIR /home/user
