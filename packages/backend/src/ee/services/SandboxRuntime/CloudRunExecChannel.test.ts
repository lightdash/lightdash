import {
    CloudRunExecChannel,
    CloudRunGatewayClient,
} from './CloudRunExecChannel';

const execJson = (payload: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
}) => ({
    ok: true,
    status: 200,
    json: async () => ({
        stdout: payload.stdout ?? '',
        stderr: payload.stderr ?? '',
        exitCode: payload.exitCode ?? 0,
    }),
    text: async () => '',
});

const b64 = (value: string): string => Buffer.from(value).toString('base64');

const tickResponse = (status: string, stdout = '', stderr = '') =>
    execJson({
        stdout: `S${status}\nO${b64(stdout)}\nE${b64(stderr)}\n`,
    });

describe('CloudRunExecChannel', () => {
    const originalFetch = global.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn().mockResolvedValue(execJson({ stdout: 'ok' }));
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test('passes invocation env separately from the sandbox command', async () => {
        const secret = 'synthetic-provider-secret';
        const client = new CloudRunGatewayClient(
            'https://gateway.example.test',
            'gateway-secret',
        );
        const channel = new CloudRunExecChannel(client, 'sandbox-1');

        await channel.commands.run('agent --run', {
            cwd: '/app',
            envs: { PROVIDER_API_KEY: secret },
            timeoutMs: 1_000,
        });

        const init = fetchMock.mock.calls[0][1] as RequestInit;
        const body = JSON.parse(String(init.body)) as {
            command: string;
            cwd?: string;
            env?: Record<string, string>;
        };

        expect(body.command).not.toContain(secret);
        expect(body.command).toContain('agent --run');
        expect(body.cwd).toBe('/app');
        expect(body.env).toEqual({ PROVIDER_API_KEY: secret });
    });

    test('passes detached command env only on the start request', async () => {
        const secret = 'synthetic-provider-secret';
        fetchMock
            .mockResolvedValueOnce(execJson({}))
            .mockResolvedValueOnce(tickResponse('0', 'done'))
            .mockResolvedValue(execJson({}));
        const client = new CloudRunGatewayClient(
            'https://gateway.example.test',
            'gateway-secret',
        );
        const channel = new CloudRunExecChannel(client, 'sandbox-1', {
            detachedThresholdMs: 1,
            pollIntervalMs: 1,
        });

        await channel.commands.run('agent --run', {
            cwd: '/app',
            envs: { PROVIDER_API_KEY: secret },
            timeoutMs: 1_000,
        });

        const bodies = fetchMock.mock.calls.map(
            (call) =>
                JSON.parse(String((call[1] as RequestInit).body)) as {
                    command: string;
                    cwd?: string;
                    env?: Record<string, string>;
                },
        );

        expect(bodies.every(({ command }) => !command.includes(secret))).toBe(
            true,
        );
        expect(bodies[0].cwd).toBe('/app');
        expect(bodies[0].env).toEqual({ PROVIDER_API_KEY: secret });
        expect(bodies.slice(1).every(({ env }) => env === undefined)).toBe(
            true,
        );
    });

    test('rejects invalid invocation env names before calling the gateway', async () => {
        const client = new CloudRunGatewayClient(
            'https://gateway.example.test',
            'gateway-secret',
        );
        const channel = new CloudRunExecChannel(client, 'sandbox-1');

        await expect(
            channel.commands.run('agent --run', {
                envs: { 'INVALID-NAME': 'value' },
            }),
        ).rejects.toThrow('Invalid sandbox env var name');
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
