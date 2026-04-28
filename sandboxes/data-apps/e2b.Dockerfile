FROM node:22

# Global tooling
RUN npm install -g pnpm@10.33.0
RUN npm install -g @anthropic-ai/claude-code

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
COPY template/skill.md ./skill.md
COPY lightdash-query-sdk.tgz ./lightdash-query-sdk.tgz

# Swap workspace:* for the local tarball, then install
RUN sed -i 's|"workspace:[*]"|"file:lightdash-query-sdk.tgz"|' package.json && \
    pnpm install --no-frozen-lockfile

# Copy starter source files (overwritten by Claude during generation)
COPY template/src/ ./src/

# Bootstrap shadcn/ui (generates src/components/ui/ and src/lib/)
RUN npx shadcn@2.3.0 init --defaults --force
RUN npx shadcn@2.3.0 add --overwrite --yes \
    button badge card table dialog tabs select input label popover tooltip separator \
    skeleton dropdown-menu sheet scroll-area switch checkbox avatar alert progress

# Vendored Claude Code skills (e.g. frontend-design @ Apache-2.0). Auto-discovered
# from /app/.claude/skills/ when Claude Code starts in the sandbox.
COPY template/.claude/ ./.claude/

# E2B sandbox runs as 'user' — make /app writable
RUN chown -R user:user /app
