import { SandboxCommandError } from '../SandboxRuntime';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({ generateObject: vi.fn() }));

type CommandOptions = {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
};

type GenerationResult = {
    responseText: string | null;
};

type PrivateAppGenerateService = {
    logger: {
        info: ReturnType<typeof vi.fn>;
        warn: ReturnType<typeof vi.fn>;
        debug: ReturnType<typeof vi.fn>;
    };
    runCodingAgentGeneration: (
        sandbox: unknown,
        appUuid: string,
        version: number,
        continueSession: boolean,
        env: Record<string, string>,
        model: 'sonnet',
        effort: 'low',
        structuredOutputSchema: string | null,
        onTelemetry: undefined,
        editScope: 'source' | 'manifest',
    ) => Promise<GenerationResult>;
};

const line = (value: unknown): string => `${JSON.stringify(value)}\n`;

const buildService = (codingAgent: 'claude' | 'codex') => {
    const appModel = {
        getVersionStatus: vi.fn().mockResolvedValue('generating'),
        recordBuildNarration: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AppGenerateService({
        dataAppTemplateService: {} as never,
        lightdashConfig: {
            appRuntime: { dataAppCodingAgent: codingAgent },
        },
        appModel,
    } as never) as unknown as PrivateAppGenerateService;
    service.logger = {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    };
    return { service, appModel };
};

const emitAcrossSecretBoundary = (
    onStdout: ((chunk: string) => void) | undefined,
    output: string,
    secret: string,
): void => {
    const splitAt = output.indexOf(secret) + Math.floor(secret.length / 2);
    onStdout?.(output.slice(0, splitAt));
    onStdout?.(output.slice(splitAt));
};

describe.each([
    {
        codingAgent: 'claude' as const,
        secretKey: 'ANTHROPIC_API_KEY',
        streamOutput: (secret: string) =>
            line({
                type: 'assistant',
                message: {
                    content: [
                        {
                            type: 'tool_use',
                            name: 'Write',
                            input: { file_path: `/app/src/${secret}.tsx` },
                        },
                    ],
                },
            }) +
            line({
                type: 'result',
                subtype: 'success',
                result: `finished with ${secret}`,
            }),
    },
    {
        codingAgent: 'codex' as const,
        secretKey: 'CODEX_API_KEY',
        streamOutput: (secret: string) =>
            line({
                type: 'item.completed',
                item: {
                    id: 'reasoning-1',
                    type: 'reasoning',
                    text: `checking ${secret}`,
                },
            }) +
            line({
                type: 'item.completed',
                item: {
                    id: 'message-1',
                    type: 'agent_message',
                    text: `finished with ${secret}`,
                },
            }),
    },
])(
    '$codingAgent output handling',
    ({ codingAgent, secretKey, streamOutput }) => {
        test('redacts streamed status, logs, and returned text', async () => {
            const secret = 'synthetic-provider-secret';
            const output = streamOutput(secret);
            const run = vi.fn(
                async (_command: string, options?: CommandOptions) => {
                    expect(options?.onStderr).toBeUndefined();
                    emitAcrossSecretBoundary(options?.onStdout, output, secret);
                    return { exitCode: 0, stdout: output, stderr: '' };
                },
            );
            const { service, appModel } = buildService(codingAgent);

            const result = await service.runCodingAgentGeneration(
                { commands: { run } },
                'app-1',
                1,
                false,
                {
                    [secretKey]: secret,
                    DATA_APP_CODEX_MODEL: 'gpt-5.1-codex-mini',
                },
                'sonnet',
                'low',
                null,
                undefined,
                'source',
            );

            expect(result.responseText).toBe('finished with [redacted]');
            expect(
                JSON.stringify(appModel.recordBuildNarration.mock.calls),
            ).toContain('[redacted]');
            expect(
                JSON.stringify(appModel.recordBuildNarration.mock.calls),
            ).not.toContain(secret);
            expect(
                JSON.stringify(service.logger.info.mock.calls),
            ).not.toContain(secret);
        });
    },
);

describe.each([
    { codingAgent: 'claude' as const, secretKey: 'ANTHROPIC_API_KEY' },
    { codingAgent: 'codex' as const, secretKey: 'CODEX_API_KEY' },
])('$codingAgent failure handling', ({ codingAgent, secretKey }) => {
    test('redacts failed command output before logging and throwing', async () => {
        vi.useFakeTimers();
        const secret = 'synthetic-provider-secret';
        const run = vi.fn(
            async (_command: string, options?: CommandOptions) => {
                expect(options?.onStderr).toBeUndefined();
                throw new SandboxCommandError(
                    1,
                    `authentication_error for ${secret}`,
                    `provider response included ${secret}`,
                );
            },
        );
        const { service } = buildService(codingAgent);

        const generation = service.runCodingAgentGeneration(
            { commands: { run } },
            'app-1',
            1,
            false,
            {
                [secretKey]: secret,
                DATA_APP_CODEX_MODEL: 'gpt-5.1-codex-mini',
            },
            'sonnet',
            'low',
            null,
            undefined,
            'source',
        );
        void generation.catch(() => undefined);

        await vi.runAllTimersAsync();
        await expect(generation).rejects.toThrow(
            'authentication_error for [redacted]',
        );

        const logs = JSON.stringify(service.logger.info.mock.calls);
        expect(logs).toContain('[redacted]');
        expect(logs).not.toContain(secret);
        vi.useRealTimers();
    });
});
