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

# Install the supported dbt versions, each in its own venv at /usr/local/dbt<X.Y>.
# We support dbt 1.8+ only: 1.8 is where dbt-core decoupled from adapters (and is
# the first version to support Python 3.12), and 1.4–1.7 are end-of-life. Pins
# mirror the production `dockerfile`. The writeback compile wrapper prepends the
# project's venv bin to PATH at run time, so the bare `dbt` the Lightdash CLI
# invokes resolves to the project's configured version (projects pinned below
# 1.8 are clamped to 1.8 — see `resolveSandboxDbtVersion`). The default `dbt`
# symlink points at the latest version for any incidental use.
RUN python3 -m venv /usr/local/dbt1.8 \
    && /usr/local/dbt1.8/bin/pip install --no-cache-dir \
        "dbt-core~=1.8.0" \
        "dbt-postgres~=1.8.0" \
        "dbt-redshift~=1.8.0" \
        "dbt-snowflake~=1.8.0" \
        "dbt-bigquery~=1.8.0" \
        "dbt-databricks~=1.8.0" \
        "dbt-trino~=1.8.0" \
        "dbt-clickhouse~=1.8.0" \
        "dbt-duckdb~=1.8.0" \
    && python3 -m venv /usr/local/dbt1.9 \
    && /usr/local/dbt1.9/bin/pip install --no-cache-dir \
        "dbt-core~=1.9.0" \
        "dbt-postgres~=1.9.0" \
        "dbt-redshift~=1.9.0" \
        "dbt-snowflake~=1.9.0" \
        "dbt-bigquery~=1.9.0" \
        "dbt-databricks~=1.9.0" \
        "dbt-trino~=1.9.0" \
        "dbt-clickhouse~=1.9.0" \
        "dbt-athena~=1.9.0" \
        "dbt-duckdb~=1.9.0" \
    && python3 -m venv /usr/local/dbt1.10 \
    && /usr/local/dbt1.10/bin/pip install --no-cache-dir \
        "dbt-core~=1.10.0" \
        "dbt-postgres~=1.10.0" \
        "dbt-redshift~=1.10.0" \
        "dbt-snowflake~=1.10.0" \
        "dbt-bigquery~=1.10.0" \
        "dbt-databricks~=1.10.0" \
        "dbt-trino~=1.10.0" \
        "dbt-clickhouse~=1.9.0" \
        "dbt-athena~=1.10.0" \
        "dbt-duckdb~=1.10.0" \
    && python3 -m venv /usr/local/dbt1.11 \
    && /usr/local/dbt1.11/bin/pip install --no-cache-dir \
        "dbt-core~=1.11.0" \
        "dbt-postgres~=1.10.0" \
        "dbt-redshift~=1.10.0" \
        "dbt-snowflake~=1.11.0" \
        "dbt-bigquery~=1.11.0" \
        "dbt-databricks~=1.11.0" \
        "dbt-trino~=1.10.0" \
        "dbt-clickhouse~=1.9.0" \
        "dbt-athena~=1.10.0" \
        "dbt-duckdb~=1.10.0" \
    && ln -s /usr/local/dbt1.11/bin/dbt /usr/local/bin/dbt

# Socket Firewall (sfw) blocks known-malicious packages at install time.
# Install it first, then route every npm/pnpm install through it.
RUN npm install -g sfw

RUN sfw npm install -g @anthropic-ai/claude-code

RUN sfw npm install -g @lightdash/cli

# Install Lightdash skills into /home/user/.claude/skills (HOME at runtime) so
# the Claude Code agent discovers them, and outside the cloned repo at /home/user/repo.
RUN lightdash install-skills --path /home/user

WORKDIR /home/user
