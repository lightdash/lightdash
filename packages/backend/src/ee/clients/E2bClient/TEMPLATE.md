# E2B Sandbox Template

Template ID: `c569hyx93rikig96f41g`

This template has Claude CLI pre-installed and is configured for Lightdash agent coding sessions.

## Template Contents

- Ubuntu base image
- Node.js runtime
- Claude CLI (`claude` command)
- Git configured for HTTPS auth
- Skills directory at `/home/user/.claude/skills`

## Network Requirements

The sandbox requires outbound access to:

- `api.anthropic.com` - Claude API
- `github.com` and `*.github.com` - Git operations
- Lightdash instance domain - API calls

## Environment Variables Required

- `ANTHROPIC_API_KEY` - For Claude CLI
- `GITHUB_TOKEN` - For git clone/push
- `LIGHTDASH_API_KEY` - For Lightdash API access
- `LIGHTDASH_URL` - Lightdash instance URL
- `LIGHTDASH_PROJECT` - Project UUID

## Usage

See `/Users/oliverlaslett/code/e2b-demo/test-sandbox.ts` for reference implementation.
