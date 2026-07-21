export const WORKDIR = '/home/user/workspace';
export const PROMPT_PATH = '/home/user/.ld-onboarding-prompt.txt';
export const CLAUDE_SKILLS_DIR = '/home/user/.claude/skills';
export const CLI_WRAPPER_PATH = '/tmp/ld';
export const CLAUDE_SETTINGS_PATH = '/tmp/ld-claude-settings.json';
export const CLAUDE_BASH_GUARD_PATH = '/tmp/ld-bash-guard.cjs';

export const CLI_WRAPPER_SCRIPT = `#!/bin/bash
deny() {
    echo "Lightdash command is not permitted during onboarding" >&2
    exit 64
}

valid_workspace_path() {
    case "$1" in
        .|./*|lightdash|lightdash/*|lightdash.config.yml|lightdash.config.yaml|LIGHTDASH_HANDOFF.md|${WORKDIR}|${WORKDIR}/*|*.yml|*.yaml) ;;
        *) deny ;;
    esac
    case "$1" in
        *../*|*/..*) deny ;;
    esac
}

valid_csv_path() {
    case "$1" in
        *../*|*/..*|*.yml|*.yaml|*.md) deny ;;
        /tmp/*.csv|${WORKDIR}/*.csv|*.csv) ;;
        *) deny ;;
    esac
}

valid_number() {
    case "$1" in
        ''|*[!0-9]*) deny ;;
    esac
}

while IFS='=' read -r name _; do
    case "$name" in
        LIGHTDASH_URL|LIGHTDASH_API_KEY|LIGHTDASH_PROJECT) ;;
        ANTHROPIC_*|OPENAI_*|OPENROUTER_*|E2B_*|GITHUB_*|GH_*|GITLAB_*|AWS_*|AZURE_CLIENT_SECRET|GOOGLE_APPLICATION_CREDENTIALS|DBT_*|PGPASSWORD|POSTGRES_PASSWORD|MYSQL_PWD|SNOWFLAKE_*|BIGQUERY_*|DATABRICKS_*|REDSHIFT_*|CLICKHOUSE_*|MSSQL_*|TRINO_*|*_PASSWORD|*_TOKEN|*_SECRET|*_PRIVATE_KEY|*_API_KEY) unset "$name" ;;
    esac
done < <(env)

[ -n "$LIGHTDASH_PROJECT" ] || deny
command="$1"
shift || true
original_args=("$@")

for arg in "$@"; do
    case "$arg" in
        --url|--url=*|--token|--token=*|--api-key|--api-key=*) deny ;;
    esac
done

case "$command" in
    --version|--help)
        [ "$#" -eq 0 ] || deny
        ;;
    config)
        [ "$#" -eq 1 ] && [ "$1" = "get-project" ] || deny
        ;;
    warehouse-catalog)
        while [ "$#" -gt 0 ]; do
            arg="$1"
            shift
            case "$arg" in
                --database|--schema|--table)
                    [ "$#" -gt 0 ] || deny
                    shift
                    ;;
                --include-fields|--json|--verbose|--help) ;;
                *) deny ;;
            esac
        done
        ;;
    lint)
        while [ "$#" -gt 0 ]; do
            arg="$1"
            shift
            case "$arg" in
                -p|--path)
                    [ "$#" -gt 0 ] || deny
                    valid_workspace_path "$1"
                    shift
                    ;;
                -f|--format)
                    [ "$#" -gt 0 ] || deny
                    case "$1" in cli|json) ;; *) deny ;; esac
                    shift
                    ;;
                --verbose|--help) ;;
                *) deny ;;
            esac
        done
        ;;
    run-chart)
        path_seen=false
        while [ "$#" -gt 0 ]; do
            arg="$1"
            shift
            case "$arg" in
                -p|--path)
                    [ "$#" -gt 0 ] || deny
                    valid_workspace_path "$1"
                    path_seen=true
                    shift
                    ;;
                -o|--output)
                    [ "$#" -gt 0 ] || deny
                    valid_csv_path "$1"
                    shift
                    ;;
                -l|--limit|--page-size)
                    [ "$#" -gt 0 ] || deny
                    valid_number "$1"
                    shift
                    ;;
                --verbose) ;;
                --help)
                    [ "\${#original_args[@]}" = "1" ] || deny
                    ;;
                *) deny ;;
            esac
        done
        if [ "\${original_args[0]}" != "--help" ]; then
            [ "$path_seen" = true ] || deny
        fi
        ;;
    sql)
        query=""
        output_seen=false
        while [ "$#" -gt 0 ]; do
            arg="$1"
            shift
            case "$arg" in
                --project|--project=*|--output=*) deny ;;
                -o|--output)
                    [ "$#" -gt 0 ] || deny
                    output="$1"
                    shift
                    valid_csv_path "$output"
                    output_seen=true
                    ;;
                --limit|--page-size)
                    [ "$#" -gt 0 ] || deny
                    valid_number "$1"
                    shift
                    ;;
                --verbose) ;;
                --help)
                    [ "\${#original_args[@]}" = "1" ] || deny
                    ;;
                -*) deny ;;
                *)
                    [ -z "$query" ] || deny
                    query="$arg"
                    ;;
            esac
        done
        if [ "\${original_args[0]}" != "--help" ]; then
            query_lower="$(printf '%s' "$query" | tr '[:upper:]' '[:lower:]')"
            case "$query_lower" in
                select\\ *|with\\ *|show\\ *|describe\\ *|explain\\ *) ;;
                *) deny ;;
            esac
            query_tokens="$(printf '%s' "$query_lower" | tr '(),\t' '    ')"
            case " $query_tokens " in
                *" insert "*|*" update "*|*" delete "*|*" merge "*|*" drop "*|*" alter "*|*" create "*|*" truncate "*|*" grant "*|*" revoke "*|*" copy "*|*" call "*|*" execute "*) deny ;;
            esac
            [ "$output_seen" = true ] || deny
        fi
        ;;
    deploy|upload|validate)
        project_seen=false
        while [ "$#" -gt 0 ]; do
            arg="$1"
            shift
            case "$arg" in
                --project)
                    [ "$#" -gt 0 ] || deny
                    [ "$1" = "$LIGHTDASH_PROJECT" ] || deny
                    project_seen=true
                    shift
                    ;;
                --project=*) deny ;;
                --help)
                    [ "\${#original_args[@]}" = "1" ] || deny
                    ;;
                --verbose) ;;
                --no-version-check)
                    [ "$command" = "deploy" ] || deny
                    ;;
                --project-dir)
                    [ "$command" = "deploy" ] || [ "$command" = "validate" ] || deny
                    [ "$#" -gt 0 ] || deny
                    valid_workspace_path "$1"
                    shift
                    ;;
                -p|--path)
                    [ "$command" = "upload" ] || deny
                    [ "$#" -gt 0 ] || deny
                    valid_workspace_path "$1"
                    shift
                    ;;
                -y|--assume-yes)
                    [ "$command" = "deploy" ] || deny
                    ;;
                --validate|--gzip)
                    [ "$command" = "upload" ] || deny
                    ;;
                *) deny ;;
            esac
        done
        if [ "\${original_args[0]}" != "--help" ]; then
            [ "$project_seen" = true ] || deny
        fi
        ;;
    *) deny ;;
esac

exec lightdash "$command" "\${original_args[@]}"
`;

export const CLAUDE_BASH_GUARD_SCRIPT = `const fs = require('node:fs');

let payload;
try {
    payload = JSON.parse(fs.readFileSync(0, 'utf8'));
} catch {
    console.error('Invalid Bash tool request');
    process.exit(2);
}

const command = payload?.tool_input?.command;
if (
    typeof command !== 'string' ||
    !/^\\/tmp\\/ld(?:\\s|$)/.test(command) ||
    /[\\r\\n\`$<>|&;]/.test(command)
) {
    console.error('Only direct onboarding Lightdash commands are permitted');
    process.exit(2);
}
`;

export const CLAUDE_SETTINGS = JSON.stringify({
    hooks: {
        PreToolUse: [
            {
                matcher: 'Bash',
                hooks: [
                    {
                        type: 'command',
                        command: `node ${CLAUDE_BASH_GUARD_PATH}`,
                    },
                ],
            },
        ],
    },
});

export const CLAUDE_MODEL = 'claude-sonnet-4-6';
export const RUN_TIMEOUT_MS = 45 * 60 * 1000;
export const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;
export const PAT_EXPIRY_GRACE_MS = 15 * 60 * 1000;
export const CANCELLATION_POLL_INTERVAL_MS = 2 * 1000;
export const FILE_SYNC_INTERVAL_MS = 2 * 1000;
export const MAX_ONBOARDING_FILE_COUNT = 100;
export const MAX_ONBOARDING_FILE_SIZE_BYTES = 1024 * 1024;
export const MAX_ONBOARDING_TOTAL_SIZE_BYTES = 10 * 1024 * 1024;

export const CLAUDE_TOOLS = [
    'Read',
    'Glob',
    'Grep',
    'Edit',
    'Write',
    'Skill',
    'TodoWrite',
    'Bash',
].join(',');

export const ALLOWED_TOOLS = [
    `Read(/${WORKDIR}/**)`,
    `Glob(/${WORKDIR}/**)`,
    `Grep(/${WORKDIR}/**)`,
    `Edit(/${WORKDIR}/**)`,
    `Write(/${WORKDIR}/**)`,
    `Read(/${CLAUDE_SKILLS_DIR}/**)`,
    'Skill',
    'TodoWrite',
    `Bash(${CLI_WRAPPER_PATH}:*)`,
].join(',');
