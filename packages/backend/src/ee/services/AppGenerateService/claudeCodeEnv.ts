import { MissingConfigError } from '@lightdash/common';

/**
 * The subset of the Bedrock provider config the `claude` CLI needs: a region
 * plus either a bearer token (API key) or static IAM credentials. This is
 * structurally a subset of `lightdashConfig.ai.copilot.providers.bedrock`, so
 * that config can be passed straight through without remapping.
 */
export type ClaudeCodeBedrockConfig =
    | { region: string; apiKey: string }
    | {
          region: string;
          accessKeyId: string;
          secretAccessKey: string;
          sessionToken?: string;
      };

/**
 * The slice of the AI copilot config the Claude CLI env depends on: the active
 * provider switch (`AI_DEFAULT_PROVIDER`) and the Bedrock credentials.
 * Structurally a subset of `lightdashConfig.ai.copilot`, so it can be passed
 * straight through.
 */
export type ClaudeCodeProviderConfig = {
    defaultProvider: string;
    providers: { bedrock?: ClaudeCodeBedrockConfig };
};

/**
 * Resolves the Bedrock config the data-apps pipeline should use:
 * - not on Bedrock (`AI_DEFAULT_PROVIDER` ≠ bedrock) → null (use the Anthropic API)
 * - on Bedrock with credentials + region → the config
 * - on Bedrock but missing credentials or region → throws, rather than silently
 *   falling back to Anthropic or injecting an undefined region (which fails
 *   opaquely at runtime). The AI config schema is parsed leniently
 *   (safeParse → Sentry), so these checks can't be relied on at startup.
 */
const resolveBedrockConfig = (
    copilot: ClaudeCodeProviderConfig,
): ClaudeCodeBedrockConfig | null => {
    if (copilot.defaultProvider !== 'bedrock') {
        return null;
    }
    const { bedrock } = copilot.providers;
    if (!bedrock) {
        throw new MissingConfigError(
            'AI_DEFAULT_PROVIDER is set to "bedrock" but no Bedrock credentials are configured. Set BEDROCK_API_KEY, or BEDROCK_ACCESS_KEY_ID and BEDROCK_SECRET_ACCESS_KEY (with BEDROCK_REGION).',
        );
    }
    if (!bedrock.region) {
        throw new MissingConfigError(
            'AI_DEFAULT_PROVIDER is set to "bedrock" but BEDROCK_REGION is not set.',
        );
    }
    return bedrock;
};

/**
 * Builds the environment variables passed to the `claude` CLI inside the E2B
 * sandbox. Data apps follow the same provider switch as the AI copilot: when
 * `AI_DEFAULT_PROVIDER` is `bedrock` they route through Bedrock (bearer token or
 * IAM credentials); for any other provider they use the Anthropic API, since
 * Claude Code only supports Anthropic and Bedrock.
 *
 * `resolveAnthropicApiKey` is a thunk so the Anthropic key is only resolved
 * (and validated) when we actually need it — in Bedrock mode it is never called.
 */
export const buildClaudeCodeEnv = (
    copilot: ClaudeCodeProviderConfig,
    resolveAnthropicApiKey: () => string,
): Record<string, string> => {
    const bedrock = resolveBedrockConfig(copilot);

    if (!bedrock) {
        return { ANTHROPIC_API_KEY: resolveAnthropicApiKey() };
    }

    const base: Record<string, string> = {
        CLAUDE_CODE_USE_BEDROCK: '1',
        AWS_REGION: bedrock.region,
    };

    if ('apiKey' in bedrock) {
        return { ...base, AWS_BEARER_TOKEN_BEDROCK: bedrock.apiKey };
    }

    return {
        ...base,
        AWS_ACCESS_KEY_ID: bedrock.accessKeyId,
        AWS_SECRET_ACCESS_KEY: bedrock.secretAccessKey,
        ...(bedrock.sessionToken
            ? { AWS_SESSION_TOKEN: bedrock.sessionToken }
            : {}),
    };
};

/**
 * A non-secret, human-readable summary of the env from `buildClaudeCodeEnv`,
 * for logging which provider the sandbox launched with. Never includes the
 * credential values — only the mode and (for Bedrock) the auth method + region.
 */
export const describeClaudeCodeEnv = (env: Record<string, string>): string => {
    if (env.CLAUDE_CODE_USE_BEDROCK !== '1') {
        return 'Anthropic API';
    }
    const method = 'AWS_BEARER_TOKEN_BEDROCK' in env ? 'API key' : 'IAM';
    return `Bedrock (${method}, region=${env.AWS_REGION})`;
};

/**
 * The egress allowlist for the E2B sandbox firewall. Data apps deny all
 * outbound traffic except the LLM endpoint, so this must follow the same
 * provider switch as the env: the Bedrock runtime + control-plane hosts for
 * the region in Bedrock mode, otherwise the Anthropic API host.
 */
export const claudeCodeAllowedHosts = (
    copilot: ClaudeCodeProviderConfig,
): string[] => {
    const bedrock = resolveBedrockConfig(copilot);
    if (!bedrock) {
        return ['api.anthropic.com'];
    }
    return [
        `bedrock-runtime.${bedrock.region}.amazonaws.com`,
        `bedrock.${bedrock.region}.amazonaws.com`,
    ];
};
