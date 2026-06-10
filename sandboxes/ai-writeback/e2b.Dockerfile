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

# Socket Firewall (sfw) blocks known-malicious packages at install time.
# Install it first, then route every npm/pnpm install through it.
RUN npm install -g sfw

RUN sfw npm install -g @anthropic-ai/claude-code

RUN sfw npm install -g @lightdash/cli

# Install Lightdash skills into /home/user/.claude/skills (HOME at runtime) so
# the Claude Code agent discovers them, and outside the cloned repo at /home/user/repo.
RUN lightdash install-skills --path /home/user

WORKDIR /home/user
