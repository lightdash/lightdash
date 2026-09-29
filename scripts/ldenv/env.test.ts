import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const testHome = path.join(os.tmpdir(), `ldenv-env-tests-${process.pid}`);
process.env.LDENV_HOME = testHome;
after(() => rm(testHome, { recursive: true, force: true }));

test('original user env survives repeated tracing rewrites and down restore', async () => {
    const { newInstance } = await import('./model.js');
    const { restoreInstanceEnv, writeInstanceEnv, writeTracingEnv } =
        await import('./env.js');
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-env-root-'));
    const instance = newInstance(root, 'a'.repeat(40));
    const file = path.join(root, '.env.development.local');
    const backup = path.join(testHome, 'env-backups', `${instance.id}.json`);
    const original = 'USER_FLAG=hand-written\nLIGHTDASH_LICENSE_KEY=original\n';
    try {
        await writeFile(file, original);
        await writeInstanceEnv(instance, { USER_FLAG: 'generated' });
        const env = { USER_FLAG: 'generated' };
        await writeTracingEnv(instance, env, 'true');
        assert.match(await readFile(file, 'utf8'), /LDENV_TRACING='true'/);
        assert.match(await readFile(file, 'utf8'), /OTEL_SDK_DISABLED='false'/);
        await writeTracingEnv(instance, env, 'false');
        const saved = JSON.parse(await readFile(backup, 'utf8')) as {
            previous: string;
            writtenHash: string;
        };
        assert.equal(saved.previous, original);
        assert(saved.writtenHash);
        assert.equal(await restoreInstanceEnv(instance), null);
        assert.equal(await readFile(file, 'utf8'), original);
        await assert.rejects(readFile(backup, 'utf8'), { code: 'ENOENT' });
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('manual env edit prevents tracing overwrite and retains the original backup on down', async () => {
    const { newInstance } = await import('./model.js');
    const { restoreInstanceEnv, writeInstanceEnv, writeTracingEnv } =
        await import('./env.js');
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-env-root-'));
    const instance = newInstance(root, 'a'.repeat(40));
    const file = path.join(root, '.env.development.local');
    const backup = path.join(testHome, 'env-backups', `${instance.id}.json`);
    const original = 'USER_FLAG=original\n';
    const manual = 'USER_FLAG=manual-edit\n';
    try {
        await writeFile(file, original);
        await writeInstanceEnv(instance, { USER_FLAG: 'generated' });
        await writeFile(file, manual);
        await assert.rejects(
            writeTracingEnv(instance, { USER_FLAG: 'generated' }, 'true'),
            /Environment file changed outside ldenv/,
        );
        assert.equal(await restoreInstanceEnv(instance), backup);
        assert.equal(await readFile(file, 'utf8'), manual);
        const saved = JSON.parse(await readFile(backup, 'utf8')) as {
            previous: string;
        };
        assert.equal(saved.previous, original);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('concurrent tracing rewrites serialize backup and env writes', async () => {
    const { newInstance } = await import('./model.js');
    const { restoreInstanceEnv, writeInstanceEnv, writeTracingEnv } =
        await import('./env.js');
    const root = await mkdtemp(path.join(os.tmpdir(), 'ldenv-env-root-'));
    const instance = newInstance(root, 'a'.repeat(40));
    const file = path.join(root, '.env.development.local');
    const backup = path.join(testHome, 'env-backups', `${instance.id}.json`);
    const original = 'USER_FLAG=original\n';
    try {
        await writeFile(file, original);
        await writeInstanceEnv(instance, { USER_FLAG: 'generated' });
        await Promise.all(
            Array.from({ length: 12 }, () =>
                writeTracingEnv(instance, { USER_FLAG: 'generated' }, 'true'),
            ),
        );
        assert.match(await readFile(file, 'utf8'), /LDENV_TRACING='true'/);
        const saved = JSON.parse(await readFile(backup, 'utf8')) as {
            previous: string;
            writtenHash: string;
        };
        assert.equal(saved.previous, original);
        assert(saved.writtenHash);
        assert.equal(await restoreInstanceEnv(instance), null);
        assert.equal(await readFile(file, 'utf8'), original);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('parent fallback supplies only the licence pair and preserves exported flags', async () => {
    const { inheritLicensePair } = await import('./env.js');
    const target: Record<string, string> = {
        LDENV_TRACING: 'true',
        AI_COPILOT_ENABLED: 'false',
        LDENV_STANDALONE_SCHEDULER: 'false',
    };
    const parent = {
        LIGHTDASH_LICENSE_KEY: 'parent-key',
        LIGHTDASH_LICENSE_CERTIFICATE: 'parent-cert',
        LDENV_TRACING: 'false',
        AI_COPILOT_ENABLED: 'true',
        LDENV_STANDALONE_SCHEDULER: 'true',
    };
    inheritLicensePair(target, parent);
    assert.deepEqual(target, {
        LDENV_TRACING: 'true',
        AI_COPILOT_ENABLED: 'false',
        LDENV_STANDALONE_SCHEDULER: 'false',
        LIGHTDASH_LICENSE_KEY: 'parent-key',
        LIGHTDASH_LICENSE_CERTIFICATE: 'parent-cert',
    });
    inheritLicensePair(target, {
        LIGHTDASH_LICENSE_KEY: 'another-key',
        LIGHTDASH_LICENSE_CERTIFICATE: 'another-cert',
    });
    assert.equal(target.LIGHTDASH_LICENSE_KEY, 'parent-key');
    assert.equal(target.LIGHTDASH_LICENSE_CERTIFICATE, 'parent-cert');
});
