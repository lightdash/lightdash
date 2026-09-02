import { redactSandboxEnvSecrets } from './sandboxOutputRedaction';

describe('redactSandboxEnvSecrets', () => {
    const secretEnvKeys = [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_BEARER_TOKEN_BEDROCK',
        'CODEX_API_KEY',
        'OTEL_EXPORTER_OTLP_HEADERS',
        'FIRST_API_KEY',
        'SECOND_API_KEY',
        'PROVIDER_API_KEY',
    ];

    test('redacts coding-agent credentials while preserving configuration', () => {
        const text = [
            'anthropic-key',
            'gateway-token',
            'AKIAEXAMPLE',
            'aws-secret',
            'aws-session',
            'bedrock-token',
            'codex-key',
            'us-east-1',
        ].join(' ');

        expect(
            redactSandboxEnvSecrets(
                text,
                {
                    ANTHROPIC_API_KEY: 'anthropic-key',
                    ANTHROPIC_AUTH_TOKEN: 'gateway-token',
                    AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE',
                    AWS_SECRET_ACCESS_KEY: 'aws-secret',
                    AWS_SESSION_TOKEN: 'aws-session',
                    AWS_BEARER_TOKEN_BEDROCK: 'bedrock-token',
                    CODEX_API_KEY: 'codex-key',
                    AWS_REGION: 'us-east-1',
                },
                secretEnvKeys,
            ),
        ).toBe(
            '[redacted] [redacted] [redacted] [redacted] [redacted] [redacted] [redacted] us-east-1',
        );
    });

    test('redacts the complete OTLP header value', () => {
        const headers = 'Authorization=Bearer synthetic-token,x-project=test';

        expect(
            redactSandboxEnvSecrets(
                `export headers: ${headers}`,
                {
                    OTEL_EXPORTER_OTLP_HEADERS: headers,
                },
                secretEnvKeys,
            ),
        ).toBe('export headers: [redacted]');
    });

    test('redacts longer overlapping values first', () => {
        expect(
            redactSandboxEnvSecrets(
                'token-long token',
                {
                    FIRST_API_KEY: 'token',
                    SECOND_API_KEY: 'token-long',
                },
                secretEnvKeys,
            ),
        ).toBe('[redacted] [redacted]');
    });

    test('matches secret values literally', () => {
        expect(
            redactSandboxEnvSecrets(
                'failed for key.*[value]',
                {
                    PROVIDER_API_KEY: 'key.*[value]',
                },
                secretEnvKeys,
            ),
        ).toBe('failed for [redacted]');
    });

    test('ignores empty and non-secret environment values', () => {
        expect(
            redactSandboxEnvSecrets(
                'region=us-east-1',
                {
                    PROVIDER_API_KEY: '',
                    AWS_REGION: 'us-east-1',
                },
                secretEnvKeys,
            ),
        ).toBe('region=us-east-1');
    });
});
