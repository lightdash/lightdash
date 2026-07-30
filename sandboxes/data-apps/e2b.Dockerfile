FROM node:22

# Global tooling
RUN npm install -g pnpm@11.17.0
RUN npm install -g @anthropic-ai/claude-code@2.1.220

WORKDIR /app

# Copy config files and pre-packed SDK tarball
COPY template/package.json ./package.json
COPY template/.npmrc ./.npmrc
COPY template/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY template/vite.config.js ./vite.config.js
COPY template/tsconfig.json ./tsconfig.json
COPY template/tailwind.config.js ./tailwind.config.js
COPY template/postcss.config.js ./postcss.config.js
COPY template/index.html ./index.html
COPY template/components.json ./components.json
COPY template/skill.md ./skill.md
COPY template/references/ ./references/
COPY lightdash-query-sdk.tgz ./lightdash-query-sdk.tgz

# Swap workspace:* for the local tarball, then install
RUN sed -i 's|"workspace:[*]"|"file:lightdash-query-sdk.tgz"|' package.json && \
    pnpm install --no-frozen-lockfile

# Copy the complete starter source, including the checked-in shadcn/ui components
# used by both E2B and locally-created data apps.
COPY template/src/ ./src/

# Claude Code skills — first-party plus vendored (frontend-design @ Apache-2.0).
# The whole directory is copied, so a new skill needs no change here. Read from
# /app/.claude/skills/ inside the sandbox.
COPY template/.claude/ ./.claude/

# E2B sandbox runs as 'user' — make /app writable
RUN chown -R user:user /app
