import {
    buildClaudeCodeEnv,
    claudeCodeAllowedHosts,
    describeClaudeCodeEnv,
} from './claudeCodeEnv';

describe('buildClaudeCodeEnv', () => {
    const bedrockApiKey = { apiKey: 'bedrock-key', region: 'us-east-1' };

    test('uses the Bedrock API-key env when defaultProvider is bedrock', () => {
        const env = buildClaudeCodeEnv(
            {
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
                defaultProvider: 'openai',
                providers: { bedrock: bedrockApiKey },
            },
            () => 'anthropic-key',
        );

        expect(env).toEqual({ ANTHROPIC_API_KEY: 'anthropic-key' });
    });

    test('throws when defaultProvider is bedrock but no Bedrock creds are configured', () => {
        expect(() =>
            buildClaudeCodeEnv(
                { defaultProvider: 'bedrock', providers: {} },
                () => 'anthropic-key',
            ),
        ).toThrow('BEDROCK_API_KEY');
    });

    test('throws when defaultProvider is bedrock but the region is missing', () => {
        expect(() =>
            buildClaudeCodeEnv(
                {
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

    test('throws when Bedrock is selected but unconfigured', () => {
        expect(() =>
            claudeCodeAllowedHosts({
                defaultProvider: 'bedrock',
                providers: {},
            }),
        ).toThrow('BEDROCK_API_KEY');
    });
});
