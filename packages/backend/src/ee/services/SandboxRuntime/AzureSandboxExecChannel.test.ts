import { Agent } from 'undici';
import {
    AzureSandboxExecChannel,
    bufferedExecDispatcher,
} from './AzureSandboxExecChannel';

type CapturedInit = RequestInit & { dispatcher?: unknown };

describe('AzureSandboxExecChannel undici timeouts', () => {
    const originalFetch = global.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }),
            text: async () => 'file contents',
        });
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    const makeChannel = () =>
        new AzureSandboxExecChannel(
            'https://eastus2.example.test/sandboxes/s1',
            '2024-02-02-preview',
            async () => 'token',
        );

    const capturedInit = (): CapturedInit =>
        fetchMock.mock.calls[0][1] as CapturedInit;

    it('disables undici header/body timeouts for exec calls bounded by timeoutMs', async () => {
        await makeChannel().commands.run('sleep 600', {
            timeoutMs: 55 * 60 * 1000,
        });
        expect(bufferedExecDispatcher).toBeInstanceOf(Agent);
        expect(capturedInit().dispatcher).toBe(bufferedExecDispatcher);
    });

    it('keeps undici defaults for exec calls with no timeout bound', async () => {
        await makeChannel().commands.run('echo hi');
        expect(capturedInit().dispatcher).toBeUndefined();
    });

    it('keeps undici defaults for file operations', async () => {
        await makeChannel().files.read('/tmp/a.txt');
        expect(capturedInit().dispatcher).toBeUndefined();
    });
});
