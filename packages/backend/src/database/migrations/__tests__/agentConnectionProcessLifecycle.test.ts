import { spawn } from 'node:child_process';
import {
    closeConnectionProcess,
    waitForReady,
} from './agentConnectionProcessLifecycle.mock';

it('rejects a clean exit before ready and reaps the child', async () => {
    const child = spawn(process.execPath, ['-e', 'process.exit(0)']);
    try {
        await expect(waitForReady(child)).rejects.toThrow(
            'Child exited before ready (0)',
        );
    } finally {
        await closeConnectionProcess(child);
    }
    expect(child.exitCode).toBe(0);
}, 10000);

it('kills and reaps a child that ignores cooperative shutdown', async () => {
    const child = spawn(
        process.execPath,
        [
            '-e',
            `
        process.on('message', () => {});
        process.on('SIGTERM', () => {});
        setInterval(() => {}, 1000);
        process.send({ kind: 'ready', base: '', pid: process.pid, databasePid: 0 });
    `,
        ],
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    );
    try {
        await waitForReady(child);
        await closeConnectionProcess(child, 50);
        expect(child.signalCode).toBe('SIGKILL');
    } finally {
        await closeConnectionProcess(child);
    }
}, 10000);
