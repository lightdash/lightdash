import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export type TestServer = {
    child: ChildProcess;
    base: string;
    pid: number;
    databasePid: number;
};

export const waitForReady = (child: ChildProcess): Promise<TestServer> =>
    new Promise((resolve, reject) => {
        let output = '';
        const capture = (data: Buffer) => {
            output = `${output}${String(data)}`.slice(-6000);
        };
        const disposers: (() => void)[] = [];
        const cleanup = () => disposers.forEach((dispose) => dispose());
        const failed = (error: Error) => {
            cleanup();
            reject(error);
        };
        const exited = (code: number | null, signal: string | null) =>
            failed(
                new Error(
                    `Child exited before ready (${code ?? signal}): ${output}`,
                ),
            );
        const ready = (
            message: Omit<TestServer, 'child'> & { kind: string },
        ) => {
            if (message.kind === 'ready') {
                cleanup();
                resolve({ child, ...message });
            }
        };
        const timeout = setTimeout(
            () => failed(new Error(`Child did not start: ${output}`)),
            60000,
        );
        disposers.push(() => {
            clearTimeout(timeout);
            child.removeListener('error', failed);
            child.removeListener('exit', exited);
            child.removeListener('message', ready);
            child.stdout?.removeListener('data', capture);
            child.stderr?.removeListener('data', capture);
            child.stdout?.resume();
            child.stderr?.resume();
        });
        child.stdout?.on('data', capture);
        child.stderr?.on('data', capture);
        child.once('error', failed);
        child.once('exit', exited);
        child.on('message', ready);
    });

export const startConnectionProcess = (
    connectionUri: string,
    children: ChildProcess[],
): Promise<TestServer> => {
    const child = fork(
        path.join(__dirname, 'agentConnectionHttpProcess.mock.ts'),
        [],
        {
            execArgv: ['--import', require.resolve('tsx')],
            env: {
                ...process.env,
                EXPERIMENTAL_CACHE: 'true',
                AGENT_TEST_DATABASE_URI: connectionUri,
            },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        },
    );
    children.push(child);
    return waitForReady(child);
};

export const closeConnectionProcess = (
    child: ChildProcess,
    deadlineMs = 5000,
): Promise<void> =>
    new Promise((resolve, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) {
            resolve();
            return;
        }
        let killDeadline: ReturnType<typeof setTimeout> | undefined;
        const disposers: (() => void)[] = [];
        const cleanup = () => disposers.forEach((dispose) => dispose());
        const exited = () => {
            cleanup();
            resolve();
        };
        const deadline = setTimeout(() => {
            child.kill('SIGKILL');
            killDeadline = setTimeout(() => {
                cleanup();
                reject(
                    new Error(`Child ${child.pid} did not exit after SIGKILL`),
                );
            }, 5000);
        }, deadlineMs);
        disposers.push(() => {
            clearTimeout(deadline);
            clearTimeout(killDeadline);
            child.removeListener('exit', exited);
        });
        child.once('exit', exited);
        if (child.connected)
            child.send({ command: 'close' }, (error) => {
                if (error) child.kill('SIGTERM');
            });
        else child.kill('SIGTERM');
    });
