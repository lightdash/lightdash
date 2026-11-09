import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

const root = path.resolve(__dirname, '../../../..');

const readJson = <T>(filename: string): T => {
    try {
        return JSON.parse(readFileSync(filename, 'utf8')) as T;
    } catch {
        throw new Error(`Unable to read JSON fixture: ${filename}`);
    }
};

const captureBackendLaunch = (overrides: Record<string, string> = {}) => {
    const directory = mkdtempSync(path.join(tmpdir(), 'dev-inspector-'));
    const output = path.join(directory, 'launch.json');
    const { scripts } = readJson<{ scripts: { dev: string } }>(
        path.join(root, 'packages/backend/package.json'),
    );
    writeFileSync(
        path.join(directory, 'tsx'),
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.INSPECTOR_TEST_OUTPUT, JSON.stringify({args:process.argv.slice(2),mode:process.env.LIGHTDASH_MODE,headless:process.env.HEADLESS}));\n`,
        { mode: 0o700 },
    );
    try {
        execFileSync('/bin/sh', ['-c', scripts.dev], {
            cwd: root,
            env: {
                ...process.env,
                PATH: `${directory}:${process.env.PATH}`,
                INSPECTOR_TEST_OUTPUT: output,
                LIGHTDASH_MODE: '',
                DEBUG_HOST: '',
                DEBUG_PORT: '',
                ...overrides,
            },
            timeout: 5000,
        });
        return readJson<{ args: string[]; mode: string; headless: string }>(
            output,
        );
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
};

const pm2InspectorArguments = (debugHost = '') => {
    const config = {
        exports: {
            apps: [] as { name: string; node_args?: string | string[] }[],
        },
    };
    runInNewContext(
        readFileSync(path.join(root, 'ecosystem.config.js'), 'utf8'),
        {
            __dirname: root,
            module: config,
            process: { env: {} },
            console: { log: () => undefined },
            require: (name: string) => {
                switch (name) {
                    case 'child_process':
                        return { spawnSync: () => ({ stdout: '' }) };
                    case 'os':
                        return { homedir: () => '/tmp' };
                    case 'path':
                        return path;
                    case 'dotenv':
                        return {
                            config: () => ({
                                parsed: {
                                    LD_INSTANCE_ID: 'inspector-test',
                                    DEBUG_PORT: '19383',
                                    DEBUG_HOST: debugHost,
                                },
                            }),
                        };
                    default:
                        throw new Error(`Unexpected config import: ${name}`);
                }
            },
        },
        { timeout: 1000 },
    );
    const api = config.exports.apps.find(
        ({ name }) => name === 'inspector-test-api',
    );
    if (typeof api?.node_args !== 'string')
        throw new Error(
            'The ldenv wrapper requires string inspector arguments',
        );
    return api.node_args.split(' ');
};

describe('development inspector bindings', () => {
    it('keeps the backend launcher on loopback by default without changing its other arguments', () => {
        expect(captureBackendLaunch()).toEqual({
            args: [
                'watch',
                '--clear-screen=false',
                '--inspect=127.0.0.1:9229',
                'src/index.ts',
            ],
            mode: 'development',
            headless: 'true',
        });
    });

    it('requires explicit host opt-in and preserves the selected instance port and mode', () => {
        expect(
            captureBackendLaunch({
                DEBUG_HOST: '0.0.0.0',
                DEBUG_PORT: '19383',
                LIGHTDASH_MODE: 'development',
            }).args,
        ).toContain('--inspect=0.0.0.0:19383');
    });

    it('passes a host value as one argument rather than injecting extra launcher options', () => {
        const launch = captureBackendLaunch({
            DEBUG_HOST: '127.0.0.1 --trace-warnings',
            DEBUG_PORT: '19383',
        });
        expect(launch.args).toContain(
            '--inspect=127.0.0.1 --trace-warnings:19383',
        );
        expect(launch.args).toHaveLength(4);
    });

    it('keeps PM2 on loopback and its assigned debug port by default', () => {
        expect(pm2InspectorArguments()).toEqual([
            '--import',
            'tsx',
            '--inspect=127.0.0.1:19383',
        ]);
    });

    it('allows an explicit PM2 host opt-in without changing the debug port', () => {
        expect(pm2InspectorArguments('0.0.0.0')).toEqual([
            '--import',
            'tsx',
            '--inspect=0.0.0.0:19383',
        ]);
    });
});
