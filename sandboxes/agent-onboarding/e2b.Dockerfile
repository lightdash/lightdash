FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g sfw

RUN sfw npm install -g @anthropic-ai/claude-code

# The service pins the CLI to the server version at run start; this is a fallback.
RUN sfw npm install -g @lightdash/cli

RUN lightdash install-skills --path /home/user

WORKDIR /home/user
