import {
    APP_VERSION_CANCELLED_BY_USER,
    type AppGeneratePipelineJobPayload,
    type AppVersionStatus,
    type ByoAiProvider,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
import { SandboxCommandError } from '../SandboxRuntime';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));

const PROVIDER_SECRET = 'synthetic-provider-secret';
const GATEWAY_SECRET = 'synthetic-gateway-secret';
const OTEL_HEADERS = 'Authorization=Bearer synthetic-otel-secret';
const PAYLOAD: AppGeneratePipelineJobPayload = {
    appUuid: 'app-1',
    version: 1,
    projectUuid: 'project-1',
    organizationUuid: 'org-1',
    userUuid: 'user-1',
    prompt: 'Build a dashboard',
    isIteration: false,
    claudeEffort: 'low',
};

function buildService(codingAgent: 'claude' | 'codex' = 'claude') {
    const version = {
        status: 'pending' as AppVersionStatus,
        error: null as string | null,
        statusMessage: null as string | null,
        dependencies: null,
    };
    const appModel = {
        getVersionStatus: vi.fn(async () => version.status),
        getVersion: vi.fn(async () => version),
        getApp: vi.fn().mockResolvedValue({ template: null }),
        updateSandboxUuid: vi.fn().mockResolvedValue(undefined),
        touchVersionIfInProgress: vi.fn().mockResolvedValue(undefined),
        updateVersionStatusIfInProgress: vi.fn(
            async (
                _appUuid: string,
                _version: number,
                status: AppVersionStatus,
                error: string | null,
                statusMessage: string,
            ) => {
                if (version.status === 'error') return false;
                Object.assign(version, { status, error, statusMessage });
                return true;
            },
        ),
    };
    const sandbox = {
        commands: { run: vi.fn() },
    };
    const copilot = {
        defaultProvider: 'anthropic',
        providers: {
            anthropic: {
                apiKey: PROVIDER_SECRET,
                baseUrl: 'https://mesh.example/anthropic',
            },
            openai: {
                apiKey: PROVIDER_SECRET,
                modelName: 'gpt-5.6-terra',
                baseUrl: 'https://mesh.example/openai/v1',
            },
            bedrock: {
                apiKey: PROVIDER_SECRET,
                region: 'us-east-1',
                baseUrl: 'https://mesh.example/bedrock',
            },
        },
        lightdashManagedProviders: [],
        byoProviders: [] as ByoAiProvider[],
    };
    const config = {
        appRuntime: {
            ...lightdashConfigMock.appRuntime,
            dataAppCodingAgent: codingAgent,
            dataAppGatewayBaseUrls: {
                anthropic: null as string | null,
                openai: null as string | null,
                bedrock: null as string | null,
            },
            gcpCloudRun: { sandboxSecret: GATEWAY_SECRET },
        },
    };
    const analytics = { track: vi.fn() };
    const service = new AppGenerateService({
        lightdashConfig: config,
        appModel,
        analytics,
        orgAiCopilotConfigResolver: {
            getClaudeCodeConfig: vi.fn().mockResolvedValue(copilot),
            getCodexConfig: vi.fn().mockResolvedValue(copilot),
        },
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: false }),
        },
        appRuntimeS3: { client: {}, bucket: 'apps' },
        appThumbnailClient: buildAppThumbnailClientMock(),
    } as never);
    const suspendSandbox = vi.fn().mockResolvedValue(undefined);
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    };
    Object.assign(service, {
        authorizePipelineExecution: vi.fn().mockResolvedValue(undefined),
        createSandbox: vi.fn().mockResolvedValue({
            sandbox,
            sandboxUuid: 'sandbox-1',
            durationMs: 1,
        }),
        generateAppMetadataFromPrompt: vi
            .fn()
            .mockResolvedValue({ name: null }),
        resolveSandboxOtelEnv: vi.fn().mockResolvedValue({
            OTEL_EXPORTER_OTLP_HEADERS: OTEL_HEADERS,
        }),
        suspendSandbox,
        logger,
    });
    return {
        config,
        copilot,
        service,
        sandbox,
        version,
        analytics,
        logger,
        suspendSandbox,
    };
}

describe('data app pipeline setup failures', () => {
    it('marks the build failed when the setup cleanup command fails, preserving bounded, redacted stderr', async () => {
        const ctx = buildService();
        ctx.sandbox.commands.run.mockRejectedValueOnce(
            new SandboxCommandError(
                1,
                `${'x'.repeat(4000)} permission denied ${PROVIDER_SECRET} ${GATEWAY_SECRET} ${OTEL_HEADERS}`,
                '',
            ),
        );

        await ctx.service.runPipeline(PAYLOAD, 10);

        expect(ctx.version.status).toBe('error');
        expect(ctx.version.statusMessage).toBe(
            'Failed to set up build environment. Please try again.',
        );
        expect(ctx.version.error).toContain('exit code 1');
        expect(ctx.version.error).toContain('stderr:');
        expect(ctx.version.error).toContain('permission denied');
        expect(ctx.version.error).toContain('[truncated');
        expect(ctx.version.error!.length).toBeLessThan(4000);
        expect(ctx.logger.error).toHaveBeenCalledWith(
            expect.stringContaining(ctx.version.error!),
        );
        const diagnostics = JSON.stringify({
            version: ctx.version,
            logs: ctx.logger.error.mock.calls,
            events: ctx.analytics.track.mock.calls,
        });
        for (const secret of [PROVIDER_SECRET, GATEWAY_SECRET, OTEL_HEADERS]) {
            expect(diagnostics).not.toContain(secret);
        }
        expect(ctx.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'data_app.version.failed',
                properties: expect.objectContaining({
                    failureStage: 'sandbox',
                }),
            }),
        );
        expect(ctx.suspendSandbox).toHaveBeenCalledOnce();
    });

    it('preserves cancellation when a setup command fails afterward', async () => {
        const ctx = buildService();
        ctx.sandbox.commands.run.mockImplementationOnce(async () => {
            Object.assign(ctx.version, {
                status: 'error',
                error: APP_VERSION_CANCELLED_BY_USER,
                statusMessage: APP_VERSION_CANCELLED_BY_USER,
            });
            throw new SandboxCommandError(1, 'sandbox stopped', '');
        });

        await ctx.service.runPipeline(PAYLOAD, 0);

        expect(ctx.version.error).toBe(APP_VERSION_CANCELLED_BY_USER);
        expect(ctx.version.statusMessage).toBe(APP_VERSION_CANCELLED_BY_USER);
        expect(ctx.analytics.track).not.toHaveBeenCalled();
        expect(ctx.suspendSandbox).toHaveBeenCalledOnce();
    });
});

describe('data app gateway routing', () => {
    test.each([
        ['claude', 'anthropic', 'ANTHROPIC_BASE_URL'],
        ['claude', 'bedrock', 'ANTHROPIC_BEDROCK_BASE_URL'],
        ['codex', 'openai', 'OPENAI_BASE_URL'],
        ['codex', 'bedrock', 'BEDROCK_BASE_URL'],
    ] as const)(
        '%s on %s uses the sandbox URL for its environment and egress only',
        async (agent, provider, envKey) => {
            const { service, config, copilot } = buildService(agent);
            copilot.defaultProvider = provider;
            const sharedUrl = copilot.providers[provider].baseUrl;
            config.appRuntime.dataAppGatewayBaseUrls[provider] =
                'https://private.example/gateway';

            const resolved = await service['getCodingAgentConfig']('org-1');
            expect(service['getCodingAgentEnv'](resolved)[envKey]).toBe(
                'https://private.example/gateway',
            );
            expect(service['buildSandboxSpec'](resolved).egress.allow).toEqual([
                'private.example',
            ]);
            expect(copilot.providers[provider].baseUrl).toBe(sharedUrl);

            config.appRuntime.dataAppGatewayBaseUrls[provider] = null;
            const fallback = await service['getCodingAgentConfig']('org-1');
            expect(service['getCodingAgentEnv'](fallback)[envKey]).toBe(
                sharedUrl,
            );
            expect(service['buildSandboxSpec'](fallback).egress.allow).toEqual([
                'mesh.example',
            ]);
        },
    );

    test.each([
        ['claude', 'anthropic', 'ANTHROPIC_BASE_URL'],
        ['codex', 'openai', 'OPENAI_BASE_URL'],
    ] as const)(
        '%s keeps organization-owned %s credentials on their resolved endpoint',
        async (agent, provider, envKey) => {
            const { service, config, copilot } = buildService(agent);
            copilot.defaultProvider = provider;
            copilot.byoProviders = [provider];
            copilot.providers[provider].baseUrl = 'https://org.example/gateway';
            config.appRuntime.dataAppGatewayBaseUrls[provider] =
                'https://private.example/gateway';

            const resolved = await service['getCodingAgentConfig']('org-1');
            expect(service['getCodingAgentEnv'](resolved)[envKey]).toBe(
                'https://org.example/gateway',
            );
            expect(service['buildSandboxSpec'](resolved).egress.allow).toEqual([
                'org.example',
            ]);
        },
    );
});
