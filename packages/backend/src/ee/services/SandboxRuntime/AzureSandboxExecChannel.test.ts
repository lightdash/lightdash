import { Agent } from 'undici';
import {
    AzureSandboxExecChannel,
    bufferedExecDispatcher,
} from './AzureSandboxExecChannel';
import { SandboxCommandError, SandboxTimeoutError } from './errors';

type CapturedInit = RequestInit & { dispatcher?: unknown };

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
    text: async () => 'file contents',
});

const b64 = (value: string | Buffer) => Buffer.from(value).toString('base64');

/** A poll-tick exec response in the S/O/E wire protocol of detached mode. */
const tickResponse = (
    status: string,
    out: string | Buffer = '',
    err: string | Buffer = '',
) => execJson({ stdout: `S${status}\nO${b64(out)}\nE${b64(err)}\n` });

describe('AzureSandboxExecChannel', () => {
    const originalFetch = global.fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        fetchMock = vi.fn().mockResolvedValue(execJson({ stdout: 'ok' }));
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    const makeChannel = (tuning?: {
        detachedThresholdMs?: number;
        pollIntervalMs?: number;
    }) =>
        new AzureSandboxExecChannel(
            'https://eastus2.example.test/sandboxes/s1',
            '2024-02-02-preview',
            async () => 'token',
            { pollIntervalMs: 1, ...tuning },
        );

    const capturedInit = (): CapturedInit =>
        fetchMock.mock.calls[0][1] as CapturedInit;

    const requestBodies = (): string[] =>
        fetchMock.mock.calls.map((call) =>
            String((call[1] as RequestInit | undefined)?.body ?? ''),
        );

    describe('undici timeouts (buffered path)', () => {
        it('disables undici header/body timeouts for bounded exec calls under the detach threshold', async () => {
            await makeChannel().commands.run('sleep 60', {
                timeoutMs: 4 * 60 * 1000,
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

    describe('detached exec (long-bounded commands)', () => {
        it('stays on the single-request buffered path at or below the threshold', async () => {
            await makeChannel().commands.run('quick', {
                timeoutMs: 4 * 60 * 1000,
            });
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(requestBodies()[0]).not.toContain('nohup');
        });

        it('runs long-bounded commands detached and streams output across polls', async () => {
            fetchMock
                .mockResolvedValueOnce(execJson({})) // start (nohup)
                .mockResolvedValueOnce(tickResponse('', 'hello ')) // running
                .mockResolvedValueOnce(tickResponse('0', 'world')) // done
                .mockResolvedValue(execJson({})); // cleanup

            const chunks: string[] = [];
            const result = await makeChannel().commands.run('sleep 900', {
                timeoutMs: 55 * 60 * 1000,
                onStdout: (chunk) => chunks.push(chunk),
            });

            expect(result).toEqual({
                stdout: 'hello world',
                stderr: '',
                exitCode: 0,
            });
            expect(chunks).toEqual(['hello ', 'world']);

            const bodies = requestBodies();
            expect(bodies[0]).toContain('nohup');
            // setsid makes the wrapper a process-group leader so a timeout
            // can kill the whole command tree, not just the wrapper shell.
            expect(bodies[0]).toContain('setsid');
            expect(bodies[0]).toContain('sleep 900');
            // Poll offsets advance by the bytes already consumed ('hello ' = 6).
            expect(bodies[1]).toContain('tail -c +1 ');
            expect(bodies[2]).toContain('tail -c +7 ');
        });

        it('replays stderr deltas through onStderr', async () => {
            fetchMock
                .mockResolvedValueOnce(execJson({}))
                .mockResolvedValueOnce(tickResponse('0', '', 'warning!'))
                .mockResolvedValue(execJson({}));

            const errChunks: string[] = [];
            const result = await makeChannel().commands.run('cmd', {
                timeoutMs: 20 * 60 * 1000,
                onStderr: (chunk) => errChunks.push(chunk),
            });

            expect(result.stderr).toBe('warning!');
            expect(errChunks).toEqual(['warning!']);
        });

        it('does not split multi-byte UTF-8 characters across poll boundaries', async () => {
            const check = Buffer.from('✓'); // 3 bytes
            fetchMock
                .mockResolvedValueOnce(execJson({}))
                .mockResolvedValueOnce(tickResponse('', check.subarray(0, 2)))
                .mockResolvedValueOnce(tickResponse('0', check.subarray(2)))
                .mockResolvedValue(execJson({}));

            const chunks: string[] = [];
            const result = await makeChannel().commands.run('cmd', {
                timeoutMs: 20 * 60 * 1000,
                onStdout: (chunk) => chunks.push(chunk),
            });

            expect(result.stdout).toBe('✓');
            expect(chunks).toEqual(['✓']);
        });

        it('throws SandboxCommandError with the detached command exit code and captured streams', async () => {
            fetchMock
                .mockResolvedValueOnce(execJson({}))
                .mockResolvedValueOnce(tickResponse('3', 'partial', 'boom'))
                .mockResolvedValue(execJson({}));

            const promise = makeChannel().commands.run('cmd', {
                timeoutMs: 20 * 60 * 1000,
            });
            await expect(promise).rejects.toMatchObject({
                name: 'SandboxCommandError',
                exitCode: 3,
                stderr: 'boom',
                stdout: 'partial',
            });
        });

        it('tolerates a transient poll failure and keeps polling', async () => {
            fetchMock
                .mockResolvedValueOnce(execJson({})) // start
                .mockRejectedValueOnce(new Error('socket hang up')) // poll 1
                .mockResolvedValueOnce(tickResponse('0', 'done')) // poll 2
                .mockResolvedValue(execJson({}));

            const result = await makeChannel().commands.run('cmd', {
                timeoutMs: 20 * 60 * 1000,
            });
            expect(result.stdout).toBe('done');
        });

        it('gives up after repeated consecutive poll failures and attempts a group kill', async () => {
            fetchMock
                .mockResolvedValueOnce(execJson({})) // start
                .mockRejectedValue(new Error('data plane down')); // every poll

            await expect(
                makeChannel().commands.run('cmd', {
                    timeoutMs: 20 * 60 * 1000,
                }),
            ).rejects.toThrow(SandboxCommandError);

            // Abandoning the run must not orphan the command tree — a retry
            // could otherwise start a second run alongside it.
            expect(
                requestBodies().some((body) => body.includes('kill -TERM -- ')),
            ).toBe(true);
        });

        it('throws SandboxTimeoutError and kills the whole process group on timeout', async () => {
            fetchMock.mockResolvedValue(tickResponse('', '')); // never exits

            await expect(
                makeChannel({ detachedThresholdMs: 10 }).commands.run('cmd', {
                    timeoutMs: 50,
                }),
            ).rejects.toThrow(SandboxTimeoutError);

            // Killing only the wrapper shell PID would orphan its children
            // (claude, pnpm, …) — the kill must target the process group
            // (negative PGID) with a TERM → KILL escalation.
            const killBody = requestBodies().find((body) =>
                body.includes('kill'),
            );
            expect(killBody).toBeDefined();
            expect(killBody).toContain('kill -TERM -- ');
            expect(killBody).toContain('kill -KILL -- ');
            expect(killBody).toContain('/pid');
        });
    });
});
