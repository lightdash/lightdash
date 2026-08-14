import { MissingConfigError } from '@lightdash/common';

export type CodexProviderConfig = {
    providers: {
        openai?: {
            apiKey: string;
            modelName: string;
            baseUrl?: string;
        };
    };
};

const getOpenAiConfig = (copilot: CodexProviderConfig) => {
    const config = copilot.providers.openai;
    if (!config?.apiKey) {
        throw new MissingConfigError(
            'OpenAI API key is not configured for Codex (OPENAI_API_KEY)',
        );
    }
    return config;
};

/** Invocation-scoped environment for `codex exec`. */
export const buildCodexCodeEnv = (
    copilot: CodexProviderConfig,
): Record<string, string> => {
    const config = getOpenAiConfig(copilot);
    return {
        CODEX_API_KEY: config.apiKey,
        OPENAI_BASE_URL: config.baseUrl ?? 'https://api.openai.com/v1',
    };
};

export const describeCodexCodeEnv = (env: Record<string, string>): string =>
    `Codex/OpenAI (model=${env.DATA_APP_CODEX_MODEL})`;

export const CODEX_PROJECT_INSTRUCTIONS_PATH = '/app/src/AGENTS.md';

export const CODEX_PROJECT_INSTRUCTIONS = `# Lightdash data app

Before planning or editing, read \`/app/effective-skill.md\` completely when it exists. It is the authoritative Lightdash environment, data, SDK, and design reference for hosted generation, including any active organization theme instructions.

Use the applicable skills under \`.agents/skills\`:

- Use \`$frontend-design\` before writing or materially redesigning UI.
- Use \`$reusable-visualization\` for a single reusable visualization hosted by Lightdash.
- Use \`$sdk-features\` when wiring or discussing Lightdash host capabilities such as Inspect data, drill-down, exports, URL state, screenshots, or external APIs.

Only edit files under this \`src/\` directory. Do not install dependencies or change project configuration. When working outside the hosted Lightdash sandbox, where \`/app/effective-skill.md\` may not exist, use these skills and the existing source as your guide.`;

export const PREPARE_CODEX_SKILLS_COMMAND =
    'mkdir -p /app/src/.agents/skills && cp -R /app/.claude/skills/. /app/src/.agents/skills/';

export const codexSkillDirective = (isDataAppViz: boolean): string =>
    isDataAppViz
        ? '[Codex skills: use $reusable-visualization and $frontend-design before writing code.]'
        : '[Codex skills: use $frontend-design before writing UI code.]';

export const buildCodexExecCommand = ({
    reasoningEffort,
    outputSchemaPath,
}: {
    reasoningEffort: 'low' | 'high';
    outputSchemaPath: string | null;
}): string =>
    `cat /tmp/prompt.txt | codex exec ` +
    `--json --color never --ephemeral ` +
    `--sandbox workspace-write --skip-git-repo-check ` +
    `--ignore-user-config --ignore-rules ` +
    `--model "$DATA_APP_CODEX_MODEL" --cd /app/src ` +
    `-c openai_base_url="$OPENAI_BASE_URL" ` +
    `-c 'approval_policy="never"' ` +
    `-c 'model_reasoning_effort="${reasoningEffort}"' ` +
    `-c 'model_reasoning_summary="detailed"' ` +
    `-c 'model_supports_reasoning_summaries=true' ` +
    `-c 'sandbox_workspace_write.network_access=false' ` +
    `-c 'shell_environment_policy.inherit="core"' ` +
    `-c 'shell_environment_policy.ignore_default_excludes=false' ` +
    `-c 'shell_environment_policy.exclude=["CODEX_API_KEY","OPENAI_API_KEY"]' ` +
    `${outputSchemaPath ? `--output-schema ${outputSchemaPath} ` : ''}-`;

/** Egress remains host-scoped; custom OpenAI base URLs add only their host. */
export const codexCodeAllowedHosts = (
    copilot: CodexProviderConfig,
): string[] => {
    const { openai } = copilot.providers;
    if (!openai?.baseUrl) return ['api.openai.com'];
    try {
        return [new URL(openai.baseUrl).hostname];
    } catch {
        throw new MissingConfigError(
            `OpenAI base URL is invalid for Codex: ${openai.baseUrl}`,
        );
    }
};
