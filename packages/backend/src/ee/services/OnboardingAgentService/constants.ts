export const WORKDIR = '/home/user/workspace';
export const PROMPT_PATH = '/home/user/.ld-onboarding-prompt.txt';
export const CLAUDE_SKILLS_DIR = '/home/user/.claude/skills';
export const CLI_WRAPPER_PATH = '/tmp/ld';

export const CLI_WRAPPER_SCRIPT = `#!/bin/bash
while IFS='=' read -r name _; do
    case "$name" in
        LIGHTDASH_URL|LIGHTDASH_API_KEY|LIGHTDASH_PROJECT) ;;
        ANTHROPIC_*|OPENAI_*|OPENROUTER_*|E2B_*|GITHUB_*|GH_*|GITLAB_*|AWS_*|AZURE_CLIENT_SECRET|GOOGLE_APPLICATION_CREDENTIALS|DBT_*|PGPASSWORD|POSTGRES_PASSWORD|MYSQL_PWD|SNOWFLAKE_*|BIGQUERY_*|DATABRICKS_*|REDSHIFT_*|CLICKHOUSE_*|MSSQL_*|TRINO_*|*_PASSWORD|*_TOKEN|*_SECRET|*_PRIVATE_KEY|*_API_KEY) unset "$name" ;;
    esac
done < <(env)
exec lightdash "$@"
`;

export const CLAUDE_MODEL = 'claude-sonnet-4-6';
export const RUN_TIMEOUT_MS = 45 * 60 * 1000;
export const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;
export const PAT_EXPIRY_GRACE_MS = 15 * 60 * 1000;
export const CANCELLATION_POLL_INTERVAL_MS = 10 * 1000;
export const FILE_SYNC_INTERVAL_MS = 2 * 1000;

export const ALLOWED_TOOLS = [
    `Read(${WORKDIR}/**)`,
    `Glob(${WORKDIR}/**)`,
    `Grep(${WORKDIR}/**)`,
    `Edit(${WORKDIR}/**)`,
    `Write(${WORKDIR}/**)`,
    `Read(${CLAUDE_SKILLS_DIR}/**)`,
    'Skill',
    'TodoWrite',
    `Bash(${CLI_WRAPPER_PATH}:*)`,
].join(',');
