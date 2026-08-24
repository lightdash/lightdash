import { MissingConfigError, type DataAppCodexModel } from '@lightdash/common';
import {
    getLlmGatewayHostname,
    normalizeLlmGatewayBaseUrl,
} from '../../../config/aiGatewayConfig';
import type { ClaudeCodeBedrockConfig } from './claudeCodeEnv';

export type CodexCodeProvider =
    | 'openai'
    | 'amazon-bedrock'
    | 'lightdash-bedrock-gateway';

export type CodexProviderConfig = {
    defaultProvider: string;
    providers: {
        openai?: {
            apiKey: string;
            modelName: string;
            baseUrl?: string;
        };
        bedrock?: ClaudeCodeBedrockConfig;
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

const getBedrockConfig = (
    copilot: CodexProviderConfig,
): ClaudeCodeBedrockConfig | null => {
    if (copilot.defaultProvider !== 'bedrock') return null;
    const { bedrock } = copilot.providers;
    if (!bedrock) {
        throw new MissingConfigError(
            'AI_DEFAULT_PROVIDER is set to "bedrock" but no Bedrock credentials are configured. Set BEDROCK_API_KEY, BEDROCK_ACCESS_KEY_ID and BEDROCK_SECRET_ACCESS_KEY, or BEDROCK_USE_DEFAULT_CREDENTIALS (with BEDROCK_REGION).',
        );
    }
    if (!bedrock.region) {
        throw new MissingConfigError(
            'AI_DEFAULT_PROVIDER is set to "bedrock" but BEDROCK_REGION is not set.',
        );
    }
    return bedrock;
};

export const getCodexCodeProvider = (
    env: Record<string, string>,
): CodexCodeProvider => {
    if (env.DATA_APP_CODEX_PROVIDER === 'lightdash-bedrock-gateway') {
        return 'lightdash-bedrock-gateway';
    }
    if (env.DATA_APP_CODEX_PROVIDER === 'amazon-bedrock') {
        return 'amazon-bedrock';
    }
    return 'openai';
};

export const getCodexModelId = (
    provider: CodexCodeProvider,
    model: DataAppCodexModel,
): DataAppCodexModel | `openai.${DataAppCodexModel}` =>
    provider === 'openai' ? model : `openai.${model}`;

/** Invocation-scoped environment for `codex exec`. */
export const buildCodexCodeEnv = (
    copilot: CodexProviderConfig,
): Record<string, string> => {
    const bedrock = getBedrockConfig(copilot);
    if (bedrock) {
        if (bedrock.baseUrl) {
            if (!('apiKey' in bedrock)) {
                throw new MissingConfigError(
                    'Codex requires BEDROCK_API_KEY when BEDROCK_BASE_URL is configured. The built-in Codex Bedrock provider cannot override its endpoint, and custom gateway providers cannot sign requests with IAM/SigV4 credentials.',
                );
            }
            return {
                DATA_APP_CODEX_PROVIDER: 'lightdash-bedrock-gateway',
                AWS_REGION: bedrock.region,
                BEDROCK_BASE_URL: normalizeLlmGatewayBaseUrl(
                    bedrock.baseUrl,
                    'BEDROCK_BASE_URL',
                ),
                BEDROCK_GATEWAY_API_KEY: bedrock.apiKey,
            };
        }
        const base = {
            DATA_APP_CODEX_PROVIDER: 'amazon-bedrock',
            AWS_REGION: bedrock.region,
        };
        if ('apiKey' in bedrock) {
            return {
                ...base,
                AWS_BEARER_TOKEN_BEDROCK: bedrock.apiKey,
            };
        }
        if ('accessKeyId' in bedrock) {
            return {
                ...base,
                AWS_ACCESS_KEY_ID: bedrock.accessKeyId,
                AWS_SECRET_ACCESS_KEY: bedrock.secretAccessKey,
                ...(bedrock.sessionToken
                    ? { AWS_SESSION_TOKEN: bedrock.sessionToken }
                    : {}),
            };
        }
        return base;
    }

    const config = getOpenAiConfig(copilot);
    return {
        DATA_APP_CODEX_PROVIDER: 'openai',
        CODEX_API_KEY: config.apiKey,
        OPENAI_BASE_URL: config.baseUrl ?? 'https://api.openai.com/v1',
    };
};

export const describeCodexCodeEnv = (env: Record<string, string>): string => {
    const provider = getCodexCodeProvider(env);
    if (provider !== 'openai') {
        let method = 'AWS credentials';
        if (provider === 'lightdash-bedrock-gateway') {
            method = 'gateway API key';
        } else if ('AWS_BEARER_TOKEN_BEDROCK' in env) {
            method = 'API key';
        }
        const gateway =
            provider === 'lightdash-bedrock-gateway' ? ' via gateway' : '';
        return `Codex/Bedrock (${method}, region=${env.AWS_REGION}, model=${env.DATA_APP_CODEX_MODEL})${gateway}`;
    }
    return `Codex/OpenAI (model=${env.DATA_APP_CODEX_MODEL})`;
};

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
    provider,
    reasoningEffort,
    outputSchemaPath,
}: {
    provider: CodexCodeProvider;
    reasoningEffort: 'low' | 'high';
    outputSchemaPath: string | null;
}): string => {
    let providerConfig = `-c openai_base_url="$OPENAI_BASE_URL" `;
    if (provider === 'amazon-bedrock') {
        providerConfig = `-c 'model_provider="amazon-bedrock"' `;
    } else if (provider === 'lightdash-bedrock-gateway') {
        providerConfig = [
            `-c 'model_provider="lightdash-bedrock-gateway"' `,
            `-c 'model_providers.lightdash-bedrock-gateway.name="Amazon Bedrock gateway"' `,
            `-c model_providers.lightdash-bedrock-gateway.base_url="$BEDROCK_BASE_URL" `,
            `-c 'model_providers.lightdash-bedrock-gateway.env_key="BEDROCK_GATEWAY_API_KEY"' `,
            `-c 'model_providers.lightdash-bedrock-gateway.wire_api="responses"' `,
        ].join('');
    }
    return [
        `cat /tmp/prompt.txt | codex exec `,
        `--json --color never --ephemeral `,
        `--sandbox workspace-write --skip-git-repo-check `,
        `--ignore-user-config --ignore-rules `,
        `--model "$DATA_APP_CODEX_MODEL_ID" --cd /app/src `,
        providerConfig,
        `-c 'approval_policy="never"' `,
        `-c 'model_reasoning_effort="${reasoningEffort}"' `,
        `-c 'model_reasoning_summary="detailed"' `,
        `-c 'model_supports_reasoning_summaries=true' `,
        `-c 'sandbox_workspace_write.network_access=false' `,
        `-c 'shell_environment_policy.inherit="core"' `,
        `-c 'shell_environment_policy.ignore_default_excludes=false' `,
        `-c 'shell_environment_policy.exclude=["CODEX_API_KEY","OPENAI_API_KEY","AWS_BEARER_TOKEN_BEDROCK","BEDROCK_GATEWAY_API_KEY","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_SESSION_TOKEN"]' `,
        `${outputSchemaPath ? `--output-schema ${outputSchemaPath} ` : ''}-`,
    ].join('');
};

/** Egress remains host-scoped to the selected provider endpoint. */
export const codexCodeAllowedHosts = (
    copilot: CodexProviderConfig,
): string[] => {
    const bedrock = getBedrockConfig(copilot);
    if (bedrock) {
        if (bedrock.baseUrl) {
            return [getLlmGatewayHostname(bedrock.baseUrl, 'BEDROCK_BASE_URL')];
        }
        return [`bedrock-mantle.${bedrock.region}.api.aws`];
    }
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
