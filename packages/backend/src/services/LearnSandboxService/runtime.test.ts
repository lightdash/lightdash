import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
    buildSandboxEnvironment,
    detectSandboxRuntime,
    learnSandboxQueueName,
    resetSandboxRuntimeCache,
    resolveSandboxRuntime,
} from './runtime';

describe('buildSandboxEnvironment', () => {
    const baseArgs = {
        pathPrefix: ['/usr/local/dbt1.12/bin'],
        apiUrl: undefined,
        siteUrl: 'https://learn.test',
        projectUuid: 'copy',
        apiKey: 'ldpat_abc',
        workspaceDir: '/tmp/ws/copy-c1',
        projectDir: '/tmp/ws/copy-c1/project',
        databasePath: '/srv/playground/jaffle_shop.duckdb',
    };

    it('never carries host cloud credentials or unrelated secrets into the child env', () => {
        const env = buildSandboxEnvironment({
            ...baseArgs,
            processEnvironment: {
                AWS_SECRET_ACCESS_KEY: 'x',
                AWS_ACCESS_KEY_ID: 'x',
                GOOGLE_APPLICATION_CREDENTIALS: '/secret.json',
                AZURE_CLIENT_SECRET: 'x',
                IDENTITY_HEADER: 'x',
                LIGHTDASH_SECRET: 'y',
                PATH: '/usr/bin:/bin',
            },
        });
        expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
        expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
        expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
        expect(env.AZURE_CLIENT_SECRET).toBeUndefined();
        expect(env.IDENTITY_HEADER).toBeUndefined();
        expect(env.LIGHTDASH_SECRET).toBeUndefined();
        expect(JSON.stringify(env)).not.toContain('x');
        expect(JSON.stringify(env)).not.toContain('/secret.json');
    });

    it('prefixes PATH with the sandbox runtime dirs and keeps only allowlisted keys', () => {
        const env = buildSandboxEnvironment({
            ...baseArgs,
            processEnvironment: {
                PATH: '/usr/bin:/bin',
                LANG: 'en_US.UTF-8',
                RANDOM_HOST_VAR: 'should-not-appear',
            },
        });
        expect(env.PATH).toBe('/usr/local/dbt1.12/bin:/usr/bin:/bin');
        expect(env.LANG).toBe('en_US.UTF-8');
        expect(env.RANDOM_HOST_VAR).toBeUndefined();
    });

    it('sets the fixed sandbox environment values', () => {
        const env = buildSandboxEnvironment({
            ...baseArgs,
            processEnvironment: {},
        });
        expect(env).toMatchObject({
            LIGHTDASH_URL: 'https://learn.test',
            LIGHTDASH_PROJECT: 'copy',
            LIGHTDASH_API_KEY: 'ldpat_abc',
            PLAYGROUND_DATA_DIR: '/srv/playground',
            DBT_PROFILES_DIR: '/tmp/ws/copy-c1',
            DBT_PROJECT_DIR: '/tmp/ws/copy-c1/project',
            DBT_TARGET_PATH: '/tmp/ws/copy-c1/target',
            HOME: '/tmp/ws/copy-c1',
            DBT_PARTIAL_PARSE: 'false',
            DBT_SEND_ANONYMOUS_USAGE_STATS: 'false',
            CI: 'true',
            // A stalled API surfaces as a CLI error well inside the command timeout
            LIGHTDASH_API_TIMEOUT_MS: '30000',
        });
    });

    it('tells the CLI which directory holds the playground database', () => {
        // Without this the CLI rejects the materialised duckdb profile
        // ("Couldn't read profiles.yml file for duckdb") because it validates
        // the local .duckdb path against its own PLAYGROUND_DATA_DIR, which
        // is not one of the inherited allowlisted keys.
        const env = buildSandboxEnvironment({
            ...baseArgs,
            databasePath: '/var/data/playground/jaffle_shop.duckdb',
            processEnvironment: { PLAYGROUND_DATA_DIR: '/host/should-not-win' },
        });
        expect(env.PLAYGROUND_DATA_DIR).toBe('/var/data/playground');
    });

    it('prefers LEARN_SANDBOX_API_URL over siteUrl when set', () => {
        const env = buildSandboxEnvironment({
            ...baseArgs,
            apiUrl: 'http://sandbox.internal',
            processEnvironment: {},
        });
        expect(env.LIGHTDASH_URL).toBe('http://sandbox.internal');
    });
});

describe('detectSandboxRuntime', () => {
    let binDir: string;

    beforeEach(async () => {
        resetSandboxRuntimeCache();
        binDir = await mkdtemp(path.join(tmpdir(), 'learn-runtime-bin-'));
    });

    afterEach(async () => {
        resetSandboxRuntimeCache();
        await rm(binDir, { recursive: true, force: true });
    });

    it('reports node as unavailable when it cannot be resolved on PATH', async () => {
        await writeFile(path.join(binDir, 'lightdash'), '#!/bin/sh\n', {
            mode: 0o755,
        });
        await writeFile(path.join(binDir, 'dbt'), '#!/bin/sh\n', {
            mode: 0o755,
        });
        const result = await detectSandboxRuntime({
            LEARN_SANDBOX_PATH_PREFIX: binDir,
            PATH: '',
        });
        expect(result).toEqual({ lightdash: true, dbt: true, node: false });
    });

    it('reports node as available when it is resolvable on PATH', async () => {
        await writeFile(path.join(binDir, 'lightdash'), '#!/bin/sh\n', {
            mode: 0o755,
        });
        await writeFile(path.join(binDir, 'dbt'), '#!/bin/sh\n', {
            mode: 0o755,
        });
        await writeFile(path.join(binDir, 'node'), '#!/bin/sh\n', {
            mode: 0o755,
        });
        const result = await detectSandboxRuntime({
            LEARN_SANDBOX_PATH_PREFIX: binDir,
            PATH: '',
        });
        expect(result).toEqual({ lightdash: true, dbt: true, node: true });
    });
});

describe('learnSandboxQueueName', () => {
    it('is deterministic and stays within the bucket count', () => {
        const a = learnSandboxQueueName(
            '11111111-2222-3333-4444-555555555555',
            4,
        );
        expect(a).toBe(
            learnSandboxQueueName('11111111-2222-3333-4444-555555555555', 4),
        );
        expect(a).toMatch(/^learn-sandbox-[0-3]$/);
        expect(learnSandboxQueueName('anything', 1)).toBe('learn-sandbox-0');
        const seen = new Set(
            Array.from({ length: 64 }, (_, i) =>
                learnSandboxQueueName(`project-${i}`, 4),
            ),
        );
        expect(seen.size).toBeGreaterThan(1);
    });
});

describe('resolveSandboxRuntime maxConcurrentCommands', () => {
    it('defaults to 4 and accepts a positive integer override', () => {
        expect(resolveSandboxRuntime({}).maxConcurrentCommands).toBe(4);
        expect(
            resolveSandboxRuntime({
                LEARN_SANDBOX_MAX_CONCURRENT_COMMANDS: '2',
            }).maxConcurrentCommands,
        ).toBe(2);
        expect(
            resolveSandboxRuntime({
                LEARN_SANDBOX_MAX_CONCURRENT_COMMANDS: '0',
            }).maxConcurrentCommands,
        ).toBe(4);
        expect(
            resolveSandboxRuntime({
                LEARN_SANDBOX_MAX_CONCURRENT_COMMANDS: 'x',
            }).maxConcurrentCommands,
        ).toBe(4);
    });
});
