import { exec } from 'node:child_process';
import { PACKAGE_ROOT } from './env';

export type CliResult = { stdout: string; stderr: string; code: number };

type CliOptions = {
    env?: Record<string, string>;
    timeout?: number;
};

// Runs a shell command from packages/e2e (so `../../examples/...` paths resolve) and never throws on a non-zero exit.
export const runCli = (command: string, options: CliOptions = {}) =>
    new Promise<CliResult>((resolve) => {
        exec(
            command,
            {
                cwd: PACKAGE_ROOT,
                env: { ...process.env, ...options.env },
                timeout: options.timeout ?? 60_000,
                maxBuffer: 50 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                let code = 0;
                if (error !== null) {
                    code = typeof error.code === 'number' ? error.code : 1;
                }
                resolve({ stdout, stderr, code });
            },
        );
    });
