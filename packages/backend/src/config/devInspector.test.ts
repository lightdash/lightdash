import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';

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

    it('keeps Docker publication on host loopback while making the container host an explicit opt-in', () => {
        const compose = parse(
            readFileSync(
                path.join(root, 'docker/docker-compose.dev.yml'),
                'utf8',
            ),
        ) as {
            services: {
                'lightdash-dev': {
                    ports: string[];
                    environment: Record<string, string>;
                };
            };
        };
        const service = compose.services['lightdash-dev'];
        expect(service.ports.filter((port) => port.endsWith(':9229'))).toEqual([
            '127.0.0.1:9229:9229',
        ]);
        expect(service.environment.DEBUG_HOST).toBe('${DEBUG_HOST:-127.0.0.1}');
    });
});
