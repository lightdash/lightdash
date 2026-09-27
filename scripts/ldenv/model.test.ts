import { parse as parseEnv } from 'dotenv';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { databaseIdentifier, publishedEndpoint } from './infra';
import {
    assertInstance,
    diffSet,
    dotenvText,
    instanceEnvironment,
    instanceId,
    matchingTiers,
    parseRecipe,
    selectParent,
    tierEnvironment,
    type Parent,
    type Ports,
} from './model';
import { newInstance, seedCommands } from './model';

const recipe = awaitRecipe();
async function awaitRecipe() {
    return parseRecipe(
        await readFile(path.resolve(__dirname, '../../rainbow.toml'), 'utf8'),
    );
}
const parent = (sha: string, builtAt: string, seedComplete = true): Parent => ({
    sha,
    warehouseDatabase: 'ldj_0123456789ab',
    warehouseHash: 'hash',
    builtAt,
    seedComplete,
    path: '/parent',
    database: `ldp_${sha.slice(0, 12)}`,
    lockHash: 'hash',
    pnpmVersion: '12.3.4',
    sourceHashes: {},
    migrations: [],
    timings: {},
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
});
const ports: Ports = {
    pg: 5432,
    frontend: 3010,
    api: 8090,
    scheduler: 8091,
    debug: 9239,
    sdkTest: 3040,
    maple: 4330,
    prometheus: 9100,
};

test('runs every matching tier in recipe order, including EE migrations', async () => {
    const parsed = await recipe;
    const tiers = matchingTiers(parsed.tiers, [
        'packages/backend/src/ee/database/migrations/new.ts',
        'packages/common/src/index.ts',
        'packages/backend/src/controllers/UserController.ts',
        'packages/formula/src/index.ts',
    ]);
    assert.deepEqual(
        tiers.map((tier) => tier.name),
        ['formula-build', 'common-build', 'migrate', 'api-routes'],
    );
    assert.deepEqual(
        matchingTiers(parsed.tiers, ['packages/frontend/src/hello.tsx']),
        [],
    );
    assert.deepEqual(matchingTiers(parsed.tiers, ['package.json']), []);
    assert.equal(
        matchingTiers(parsed.tiers, ['pnpm-lock.yaml'])[0].preset,
        'pnpm',
    );
});
test('rejects unsupported recipe presets instead of skipping required work', async () => {
    const source = await readFile(
        path.resolve(__dirname, '../../rainbow.toml'),
        'utf8',
    );
    assert.throws(
        () =>
            parseRecipe(
                source.replace('preset = "pnpm"', 'preset = "unknown"'),
            ),
        /Unsupported preset/,
    );
});
test('selects newest completed ancestor and rejects unrelated explicit parents', async () => {
    const candidates = [
        parent('a'.repeat(40), '2026-01-01'),
        parent('b'.repeat(40), '2026-03-01'),
        parent('c'.repeat(40), '2026-04-01', false),
        parent('d'.repeat(40), '2026-05-01'),
    ];
    assert.equal(
        (await selectParent(candidates, async (sha) => sha !== 'd'.repeat(40)))
            .sha,
        'b'.repeat(40),
    );
    await assert.rejects(
        selectParent(candidates, async () => false, 'a'.repeat(12)),
        /No completed ancestor/,
    );
    await assert.rejects(
        selectParent([], async () => true),
        /parent build/,
    );
});
test('diff set keeps spaces, newlines, deletions and untracked paths without duplicates', () => {
    assert.deepEqual(
        diffSet(
            'deleted.ts\0a file.ts\0',
            'a file.ts\0staged.ts\0',
            'new\nfile.ts\0',
        ),
        ['a file.ts', 'deleted.ts', 'new\nfile.ts', 'staged.ts'],
    );
});
test('instance env overrides inherited identity, secret, database and unsafe global ports', async () => {
    const root = '/tmp/a worktree';
    const env = instanceEnvironment({
        base: { PGHOST: 'db-dev', S3_ACCESS_KEY: 'base' },
        recipe: (await recipe).env,
        local: {
            LD_INSTANCE_ID: 'donor',
            LIGHTDASH_LICENSE_KEY: 'license',
            PGDATABASE: 'parent',
            PGCONNECTIONURI: 'postgres://other',
            AI_COPILOT_ENABLED: 'true',
        },
        shared: {
            S3_ENDPOINT: 'http://localhost:9000',
            S3_ACCESS_KEY: 'shared',
        },
        worktree: root,
        id: instanceId(root),
        database: 'ld_test',
        machine: { pgPort: 15432, secret: 'machine-secret' },
        ports,
    });
    assert.equal(env.OTEL_SDK_DISABLED, 'true');
    assert.equal(env.PGPORT, '15432');
    assert.equal(env.PGDATABASE, 'ld_test');
    assert.equal(env.LD_INSTANCE_ID, instanceId(root));
    assert.equal(env.LIGHTDASH_SECRET, 'machine-secret');
    assert.equal(env.LIGHTDASH_SECRET_FALLBACKS, '[]');
    assert.equal(env.LIGHTDASH_LICENSE_KEY, 'license');
    assert.equal(env.AI_COPILOT_ENABLED, 'true');
    assert.equal(env.RUDDERSTACK_ANALYTICS_DISABLED, 'true');
    assert.equal(env.SITE_URL, 'http://localhost:3010');
    assert.equal(env.S3_ACCESS_KEY, 'shared');
    assert.equal(env.PGWIRE_PORT, undefined);
    assert.equal(env.PGCONNECTIONURI, undefined);
    assert.equal(env.LIGHTDASH_MODE, 'development');
    assert.equal(env.ALLOW_MISSING_MIGRATIONS, 'false');
    assert.deepEqual(parseEnv(dotenvText(env)), env);
    const applied = tierEnvironment(env, {
        LIGHTDASH_LICENSE_KEY: 'dummy-build-key',
        RUDDERSTACK_ANALYTICS_DISABLED: 'false',
        FOO: 'bar',
    });
    assert.equal(applied.LIGHTDASH_LICENSE_KEY, 'license');
    assert.equal(applied.RUDDERSTACK_ANALYTICS_DISABLED, 'true');
    assert.equal(applied.FOO, 'bar');
});
test('dotenv values retain multiline keys and reject ambiguous quoting', () => {
    const env = {
        PRIVATE_KEY: 'line1\nline2',
        NAME: "Charlie's file",
        VALUE: 'a#b$c`d',
    };
    assert.deepEqual(parseEnv(dotenvText(env)), env);
    assert.throws(() => dotenvText({ BAD: '\'"\\' }), /Cannot safely encode/);
});
test('storage endpoint follows compose service and port independent of provider', () => {
    assert.equal(
        publishedEndpoint('http://object-store:9000', {
            services: {
                'object-store': {
                    ports: [{ target: 9000, published: '19000' }],
                },
            },
        }),
        'http://localhost:19000',
    );
    assert.throws(
        () => publishedEndpoint('http://unknown:9000', { services: {} }),
        /No shared compose/,
    );
});
test('ownership checks reject arbitrary database names and mismatched instance records', () => {
    assert.equal(
        databaseIdentifier('ld_ldenv_0123456789abcdef'),
        '"ld_ldenv_0123456789abcdef"',
    );
    for (const name of [
        'postgres',
        'ld-shared',
        'ldp_bad',
        'ld_test; DROP DATABASE postgres',
    ])
        assert.throws(() => databaseIdentifier(name), /outside/);
    const instance = newInstance('/tmp/a', 'a'.repeat(40));
    assert.doesNotThrow(() => assertInstance(instance));
    assert.throws(
        () => assertInstance({ ...instance, worktree: '/tmp/b' }),
        /ownership/,
    );
    assert.doesNotThrow(() =>
        assertInstance({
            ...instance,
            worktree: '/tmp/b',
            adoptedFrom: '/tmp/a',
        }),
    );
});

test('separates warehouse loading from the application seed without changing the recipe', async () => {
    const commands = seedCommands((await recipe).seed.run);
    assert.equal(commands.application, 'pnpm -F backend seed');
    assert.match(commands.warehouse, /dbt1.12 deps/);
    assert.match(commands.warehouse, /dbt1.12 seed/);
    assert.match(commands.warehouse, /dbt1.12 run/);
    assert.throws(
        () => seedCommands('unknown recipe'),
        /Expected the Rainbow seed recipe/,
    );
});
