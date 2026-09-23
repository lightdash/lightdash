import {
    buildClaudeCodeEnv,
    CLAUDE_CODE_SECRET_ENV_KEYS,
    claudeCodeAllowedHosts,
    describeClaudeCodeEnv,
} from './claudeCodeEnv';
import { redactSandboxEnvSecrets } from './sandboxOutputRedaction';

describe('buildClaudeCodeEnv', () => {
    const bedrockApiKey = { apiKey: 'bedrock-key', region: 'us-east-1' };

    test('uses the Bedrock API-key env when defaultProvider is bedrock', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: null,
                defaultProvider: 'bedrock',
                providers: { bedrock: bedrockApiKey },
            },
            () => {
                throw new Error('should not resolve the Anthropic key');
            },
        );

        expect(env).toEqual({
            CLAUDE_CODE_USE_BEDROCK: '1',
            AWS_REGION: 'us-east-1',
            AWS_BEARER_TOKEN_BEDROCK: 'bedrock-key',
        });
    });

    test('uses the Bedrock IAM env with a session token when defaultProvider is bedrock', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: null,
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        region: 'eu-west-1',
                        accessKeyId: 'AKIAEXAMPLE',
                        secretAccessKey: 'secret',
                        sessionToken: 'session',
                    },
                },
            },
            () => {
                throw new Error('should not resolve the Anthropic key');
            },
        );

        expect(env).toEqual({
            CLAUDE_CODE_USE_BEDROCK: '1',
            AWS_REGION: 'eu-west-1',
            AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
            AWS_SECRET_ACCESS_KEY: 'secret',
            AWS_SESSION_TOKEN: 'session',
        });
    });

    test('omits AWS_SESSION_TOKEN when the IAM session token is absent', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: null,
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        region: 'eu-west-1',
                        accessKeyId: 'AKIAEXAMPLE',
                        secretAccessKey: 'secret',
                    },
                },
            },
            () => 'unused',
        );

        expect(env).not.toHaveProperty('AWS_SESSION_TOKEN');
        expect(env).toEqual({
            CLAUDE_CODE_USE_BEDROCK: '1',
            AWS_REGION: 'eu-west-1',
            AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
            AWS_SECRET_ACCESS_KEY: 'secret',
        });
    });

    test('sets only the region when using default credentials, letting the AWS SDK resolve them', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: null,
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        region: 'us-east-1',
                        useDefaultCredentials: true,
                    },
                },
            },
            () => {
                throw new Error('should not resolve the Anthropic key');
            },
        );

        expect(env).toEqual({
            CLAUDE_CODE_USE_BEDROCK: '1',
            AWS_REGION: 'us-east-1',
        });
    });

    test('uses the Anthropic key when defaultProvider is not bedrock, even if Bedrock creds exist', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: null,
                defaultProvider: 'openai',
                providers: { bedrock: bedrockApiKey },
            },
            () => 'anthropic-key',
        );

        expect(env).toEqual({ ANTHROPIC_API_KEY: 'anthropic-key' });
    });

    test('routes Anthropic-wire traffic through the gateway with bearer auth', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: null,
                defaultProvider: 'anthropic',
                providers: {
                    anthropic: {
                        apiKey: 'gateway-token',
                        baseUrl: 'https://llm-gateway.example/anthropic/v1/',
                    },
                },
            },
            () => 'gateway-token',
        );

        expect(env).toEqual({
            ANTHROPIC_BASE_URL: 'https://llm-gateway.example/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'gateway-token',
        });
    });

    test('routes Bedrock-wire traffic through the gateway and can skip Bedrock auth', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: null,
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        ...bedrockApiKey,
                        baseUrl: 'https://llm-gateway.example/bedrock',
                        claudeCodeSkipAuth: true,
                    },
                },
            },
            () => 'unused',
        );

        expect(env).toEqual({
            CLAUDE_CODE_USE_BEDROCK: '1',
            AWS_REGION: 'us-east-1',
            ANTHROPIC_BEDROCK_BASE_URL: 'https://llm-gateway.example/bedrock',
            CLAUDE_CODE_SKIP_BEDROCK_AUTH: '1',
        });
    });

    test('rejects Bedrock skip-auth without a gateway endpoint', () => {
        expect(() =>
            buildClaudeCodeEnv(
                {
                    promptCacheTtl: null,
                    defaultProvider: 'bedrock',
                    providers: {
                        bedrock: {
                            ...bedrockApiKey,
                            claudeCodeSkipAuth: true,
                        },
                    },
                },
                () => 'unused',
            ),
        ).toThrow('requires BEDROCK_BASE_URL');
    });

    test('emits the 1h prompt cache TTL on the Anthropic API', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: '1h',
                defaultProvider: 'anthropic',
                providers: {},
            },
            () => 'anthropic-key',
        );

        expect(env).toEqual({
            ANTHROPIC_API_KEY: 'anthropic-key',
            CLAUDE_CODE_PROMPT_CACHE_TTL: '1h',
            ENABLE_PROMPT_CACHING_1H: '1',
        });
    });

    test('emits a 5m prompt cache TTL without the legacy 1h switch', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: '5m',
                defaultProvider: 'anthropic',
                providers: {},
            },
            () => 'anthropic-key',
        );

        expect(env).toEqual({
            ANTHROPIC_API_KEY: 'anthropic-key',
            CLAUDE_CODE_PROMPT_CACHE_TTL: '5m',
        });
    });

    test('emits the 1h prompt cache TTL through the Anthropic gateway', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: '1h',
                defaultProvider: 'anthropic',
                providers: {
                    anthropic: {
                        apiKey: 'gateway-token',
                        baseUrl: 'https://llm-gateway.example/anthropic',
                    },
                },
            },
            () => 'gateway-token',
        );

        expect(env).toEqual({
            ANTHROPIC_BASE_URL: 'https://llm-gateway.example/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'gateway-token',
            CLAUDE_CODE_PROMPT_CACHE_TTL: '1h',
            ENABLE_PROMPT_CACHING_1H: '1',
        });
    });

    test('never emits the prompt cache TTL on Bedrock', () => {
        const env = buildClaudeCodeEnv(
            {
                promptCacheTtl: '1h',
                defaultProvider: 'bedrock',
                providers: { bedrock: bedrockApiKey },
            },
            () => 'unused',
        );

        expect(env).not.toHaveProperty('CLAUDE_CODE_PROMPT_CACHE_TTL');
        expect(env).not.toHaveProperty('ENABLE_PROMPT_CACHING_1H');
        expect(env).toEqual({
            CLAUDE_CODE_USE_BEDROCK: '1',
            AWS_REGION: 'us-east-1',
            AWS_BEARER_TOKEN_BEDROCK: 'bedrock-key',
        });
    });

    test('throws when defaultProvider is bedrock but no Bedrock creds are configured', () => {
        expect(() =>
            buildClaudeCodeEnv(
                {
                    promptCacheTtl: null,
                    defaultProvider: 'bedrock',
                    providers: {},
                },
                () => 'anthropic-key',
            ),
        ).toThrow('BEDROCK_API_KEY');
    });

    test('throws when defaultProvider is bedrock but the region is missing', () => {
        expect(() =>
            buildClaudeCodeEnv(
                {
                    promptCacheTtl: null,
                    defaultProvider: 'bedrock',
                    providers: { bedrock: { apiKey: 'k', region: '' } },
                },
                () => 'anthropic-key',
            ),
        ).toThrow('BEDROCK_REGION');
    });
});

describe('describeClaudeCodeEnv', () => {
    test('describes Bedrock API-key mode with region (no secrets)', () => {
        expect(
            describeClaudeCodeEnv({
                CLAUDE_CODE_USE_BEDROCK: '1',
                AWS_REGION: 'us-east-1',
                AWS_BEARER_TOKEN_BEDROCK: 'super-secret',
            }),
        ).toBe('Bedrock (API key, region=us-east-1)');
    });

    test('describes Bedrock IAM mode with region (no secrets)', () => {
        expect(
            describeClaudeCodeEnv({
                CLAUDE_CODE_USE_BEDROCK: '1',
                AWS_REGION: 'eu-west-1',
                AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
                AWS_SECRET_ACCESS_KEY: 'super-secret',
            }),
        ).toBe('Bedrock (IAM, region=eu-west-1)');
    });

    test('describes the Anthropic API mode', () => {
        expect(
            describeClaudeCodeEnv({ ANTHROPIC_API_KEY: 'super-secret' }),
        ).toBe('Anthropic API');
    });

    test('describes the prompt cache TTL without treating it as a secret', () => {
        const env = {
            ANTHROPIC_API_KEY: 'super-secret',
            CLAUDE_CODE_PROMPT_CACHE_TTL: '1h',
        };
        expect(describeClaudeCodeEnv(env)).toBe(
            'Anthropic API (prompt cache 1h)',
        );
        expect(
            redactSandboxEnvSecrets(
                'ttl=1h key=super-secret',
                env,
                CLAUDE_CODE_SECRET_ENV_KEYS,
            ),
        ).toBe('ttl=1h key=[redacted]');
    });
});

describe('claudeCodeAllowedHosts', () => {
    test('allows only api.anthropic.com when not using Bedrock', () => {
        expect(
            claudeCodeAllowedHosts({
                defaultProvider: 'openai',
                providers: {},
            }),
        ).toEqual(['api.anthropic.com']);
    });

    test('allows the Bedrock endpoints for the region (API key)', () => {
        expect(
            claudeCodeAllowedHosts({
                defaultProvider: 'bedrock',
                providers: { bedrock: { apiKey: 'k', region: 'us-east-1' } },
            }),
        ).toEqual([
            'bedrock-runtime.us-east-1.amazonaws.com',
            'bedrock.us-east-1.amazonaws.com',
        ]);
    });

    test('allows the Bedrock endpoints for the region (IAM)', () => {
        expect(
            claudeCodeAllowedHosts({
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        region: 'eu-west-1',
                        accessKeyId: 'a',
                        secretAccessKey: 's',
                    },
                },
            }),
        ).toEqual([
            'bedrock-runtime.eu-west-1.amazonaws.com',
            'bedrock.eu-west-1.amazonaws.com',
        ]);
    });

    test('allows the Bedrock endpoints for the region (default credentials)', () => {
        expect(
            claudeCodeAllowedHosts({
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        region: 'ap-southeast-1',
                        useDefaultCredentials: true,
                    },
                },
            }),
        ).toEqual([
            'bedrock-runtime.ap-southeast-1.amazonaws.com',
            'bedrock.ap-southeast-1.amazonaws.com',
        ]);
    });

    test('allows only the configured gateway host', () => {
        expect(
            claudeCodeAllowedHosts({
                defaultProvider: 'anthropic',
                providers: {
                    anthropic: {
                        apiKey: 'k',
                        baseUrl: 'https://gateway.example/anthropic',
                    },
                },
            }),
        ).toEqual(['gateway.example']);
        expect(
            claudeCodeAllowedHosts({
                defaultProvider: 'bedrock',
                providers: {
                    bedrock: {
                        apiKey: 'k',
                        region: 'us-east-1',
                        baseUrl: 'https://gateway.example/bedrock',
                    },
                },
            }),
        ).toEqual(['gateway.example']);
    });

    test('throws when Bedrock is selected but unconfigured', () => {
        expect(() =>
            claudeCodeAllowedHosts({
                defaultProvider: 'bedrock',
                providers: {},
            }),
        ).toThrow('BEDROCK_API_KEY');
    });
});
