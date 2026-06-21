# Lean E2B template for the general-purpose coding agent (`editRepo`).
#
# Deliberately MINIMAL versus sandboxes/ai-writeback: git + Node + the Claude
# Code CLI only. NO dbt venvs, NO `lightdash compile` wrapper, NO Lightdash CLI.
# This is what makes "no in-sandbox build" enforceable rather than convention —
# the general agent's tool allowlist (GENERAL_ALLOWED_TOOLS) has zero Bash
# entries, and with no toolchain on the image there is nothing to build with
# even if that ever regressed.
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Socket Firewall (sfw) blocks known-malicious packages at install time; route
# the Claude CLI install through it, mirroring the writeback image.
RUN npm install -g sfw

RUN sfw npm install -g @anthropic-ai/claude-code

# Host-curated general skills dir the agent reads (GENERAL_SKILLS_DIR in
# constants.ts), shipped empty for v1. Created so the agent's Read scope over it
# resolves; lives OUTSIDE the cloned repo at /home/user/repo.
RUN mkdir -p /home/user/.lightdash-coding-skills

WORKDIR /home/user
