import {
    buildClaudeCodeEnv,
    buildClaudeCodeTelemetryEnv,
    claudeCodeAllowedHosts,
    describeClaudeCodeEnv,
    GCP_TELEMETRY_ENDPOINT,
    resolveDataAppOtelEndpoint,
    type ClaudeCodeOtelConfig,
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

const staticOtel: ClaudeCodeOtelConfig = {
    enabled: true,
    auth: 'static',
    endpoint: 'http://collector.internal:4318',
    protocol: 'http/protobuf',
    headers: null,
    gcpProject: null,
};

describe('resolveDataAppOtelEndpoint', () => {
    test('returns null when disabled', () => {
        expect(
            resolveDataAppOtelEndpoint({ ...staticOtel, enabled: false }),
        ).toBeNull();
    });

    test('returns the configured endpoint in static mode', () => {
        expect(resolveDataAppOtelEndpoint(staticOtel)).toBe(
            'http://collector.internal:4318',
        );
    });

    test('returns GCPs public endpoint in gcp mode, ignoring the configured one', () => {
        expect(resolveDataAppOtelEndpoint({ ...staticOtel, auth: 'gcp' })).toBe(
            GCP_TELEMETRY_ENDPOINT,
        );
    });
});

describe('buildClaudeCodeTelemetryEnv', () => {
    const enabledOtel = staticOtel;

    test('returns no env when disabled', () => {
        expect(
            buildClaudeCodeTelemetryEnv(
                { ...enabledOtel, enabled: false },
                {
                    traceparent: '00-abc-def-01',
                    resourceAttributes: {},
                    endpoint: 'http://collector.internal:4318',
                    headers: null,
                },
            ),
        ).toEqual({});
    });

    test('returns no env when no resolved endpoint is set', () => {
        expect(
            buildClaudeCodeTelemetryEnv(enabledOtel, {
                traceparent: '00-abc-def-01',
                resourceAttributes: {},
                endpoint: null,
                headers: null,
            }),
        ).toEqual({});
    });

    test('enables Claude Code tracing and points it at the resolved endpoint', () => {
        const env = buildClaudeCodeTelemetryEnv(enabledOtel, {
            traceparent: null,
            resourceAttributes: {},
            endpoint: 'http://collector.internal:4318',
            headers: null,
        });

        expect(env).toEqual({
            CLAUDE_CODE_ENABLE_TELEMETRY: '1',
            CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
            OTEL_TRACES_EXPORTER: 'otlp',
            OTEL_METRICS_EXPORTER: 'none',
            OTEL_LOGS_EXPORTER: 'none',
            OTEL_LOG_USER_PROMPTS: '1',
            OTEL_LOG_TOOL_DETAILS: '1',
            OTEL_EXPORTER_OTLP_PROTOCOL: 'http/protobuf',
            OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector.internal:4318',
            OTEL_TRACES_EXPORT_INTERVAL: '1000',
            OTEL_EXPORTER_OTLP_TIMEOUT: '3000',
        });
    });

    test('captures prompts + tool details but not raw API bodies', () => {
        const env = buildClaudeCodeTelemetryEnv(enabledOtel, {
            traceparent: null,
            resourceAttributes: {},
            endpoint: 'http://collector.internal:4318',
            headers: null,
        });

        expect(env.OTEL_LOG_USER_PROMPTS).toBe('1');
        expect(env.OTEL_LOG_TOOL_DETAILS).toBe('1');
        expect(env).not.toHaveProperty('OTEL_LOG_RAW_API_BODIES');
    });

    test('includes the resolved (e.g. minted) headers + TRACEPARENT + resource attributes', () => {
        const env = buildClaudeCodeTelemetryEnv(enabledOtel, {
            traceparent:
                '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
            endpoint: GCP_TELEMETRY_ENDPOINT,
            headers:
                'Authorization=Bearer minted-token,X-Goog-User-Project=proj',
            resourceAttributes: {
                'service.name': 'lightdash-data-app',
                'data_app.app_uuid': 'app-1',
                'organization.uuid': 'org-1',
            },
        });

        expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(GCP_TELEMETRY_ENDPOINT);
        expect(env.TRACEPARENT).toBe(
            '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        );
        expect(env.OTEL_EXPORTER_OTLP_HEADERS).toBe(
            'Authorization=Bearer minted-token,X-Goog-User-Project=proj',
        );
        expect(env.OTEL_RESOURCE_ATTRIBUTES).toBe(
            'service.name=lightdash-data-app,data_app.app_uuid=app-1,organization.uuid=org-1',
        );
    });

    test('skips resource-attribute values that would corrupt the list or are empty', () => {
        const env = buildClaudeCodeTelemetryEnv(enabledOtel, {
            traceparent: null,
            endpoint: 'http://collector.internal:4318',
            headers: null,
            resourceAttributes: {
                good: 'value',
                empty: '',
                withComma: 'a,b',
                withEquals: 'a=b',
            },
        });

        expect(env.OTEL_RESOURCE_ATTRIBUTES).toBe('good=value');
    });
});

describe('claudeCodeAllowedHosts', () => {
    const enabledOtel = staticOtel;

    test('allows only api.anthropic.com when not using Bedrock', () => {
        expect(
            claudeCodeAllowedHosts({
                defaultProvider: 'openai',
                providers: {},
            }),
        ).toEqual(['api.anthropic.com']);
    });

    test('appends the OTLP collector host when OTEL is enabled', () => {
        expect(
            claudeCodeAllowedHosts(
                { defaultProvider: 'openai', providers: {} },
                enabledOtel,
            ),
        ).toEqual(['api.anthropic.com', 'collector.internal']);
    });

    test('appends the GCP telemetry host (not the configured endpoint) in gcp mode', () => {
        expect(
            claudeCodeAllowedHosts(
                { defaultProvider: 'openai', providers: {} },
                { ...enabledOtel, auth: 'gcp' },
            ),
        ).toEqual(['api.anthropic.com', 'telemetry.googleapis.com']);
    });

    test('does NOT append a collector host when OTEL is disabled', () => {
        expect(
            claudeCodeAllowedHosts(
                { defaultProvider: 'openai', providers: {} },
                { ...enabledOtel, enabled: false },
            ),
        ).toEqual(['api.anthropic.com']);
    });

    test('ignores a malformed OTLP endpoint rather than opening an invalid host', () => {
        expect(
            claudeCodeAllowedHosts(
                { defaultProvider: 'openai', providers: {} },
                { ...enabledOtel, endpoint: 'not a url' },
            ),
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
