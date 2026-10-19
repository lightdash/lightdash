import { spawn } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { clearTimeout, setTimeout } from 'timers';

export const compiledCliEntry = path.resolve(__dirname, '../../dist/index.js');
// Shared across spawns so each child skips recompiling the CLI's module graph.
const compileCache = path.join(tmpdir(), 'lightdash-cli-test-compile-cache');

export type CliProcessResult = {
    code: number | null;
    stdout: string;
    stderr: string;
};

type CliProcessOptions = {
    args: string[];
    env: NodeJS.ProcessEnv;
    cwd?: string;
    // A TypeScript entry runs under tsx; anything else runs on plain Node.
    entry?: string;
    preload?: string;
    timeoutMs?: number;
};

export const runCliProcess = ({
    args,
    env,
    cwd,
    entry = compiledCliEntry,
    preload,
    timeoutMs = 30_000,
}: CliProcessOptions): Promise<CliProcessResult> =>
    new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [
                ...(preload === undefined ? [] : ['--require', preload]),
                ...(entry.endsWith('.ts')
                    ? ['--import', require.resolve('tsx')]
                    : []),
                entry,
                ...args,
            ],
            {
                cwd,
                env: { ...env, NODE_COMPILE_CACHE: compileCache },
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => {
            child.kill('SIGKILL');
            reject(
                new Error(
                    `CLI child timed out after ${timeoutMs}ms: ${args.join(' ')}`,
                ),
            );
        }, timeoutMs);
        child.stdout.on('data', (data) => {
            stdout += String(data);
        });
        child.stderr.on('data', (data) => {
            stderr += String(data);
        });
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('close', (code) => {
            clearTimeout(timeout);
            resolve({ code, stdout, stderr });
        });
    });
