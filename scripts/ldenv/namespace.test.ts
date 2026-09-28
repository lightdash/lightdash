import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { databaseIdentifier } from './infra';
import {
    canonicalHome,
    defaultHome,
    matchesHomeLabel,
    namespaceForHome,
    postgresPort,
    resourceNames,
} from './namespace';

const id = 'ldenv_0123456789abcdef';
const sha = 'a'.repeat(40);

test('default and explicitly selected default home retain every resource name', () => {
    for (const directory of [
        defaultHome,
        path.join(os.homedir(), '.', '.ldenv'),
    ]) {
        const names = resourceNames(directory);
        assert.equal(names.namespace, '');
        assert.equal(names.postgresContainer, 'ldenv-pg');
        assert.equal(names.postgresVolume, 'ldenv_pg_data');
        assert.equal(names.parentDatabase(sha), 'ldp_aaaaaaaaaaaa');
        assert.equal(names.warehouseDatabase(sha), 'ldj_aaaaaaaaaaaa');
        assert.equal(names.instanceDatabase(id), `ld_${id}`);
        assert.equal(names.processName(id, 'api'), `${id}-api`);
    }
    assert.equal(postgresPort(undefined, ''), 15432);
    assert.equal(postgresPort(undefined, '', 15439), 15439);
    assert.throws(() => postgresPort('15432', '', 15439), /LDENV_PG_PORT/);
});

test('non-default home namespaces Docker, SQL, and PM2 names', () => {
    const directory = path.join(os.tmpdir(), '.ldenv-spike');
    const names = resourceNames(directory);
    assert.equal(names.namespace, 'spike');
    assert.equal(names.postgresContainer, 'ldenv-pg-spike');
    assert.equal(names.postgresVolume, 'ldenv_pg_data_spike');
    assert.equal(names.parentDatabase(sha), 'ldp_spike_aaaaaaaaaaaa');
    assert.equal(names.warehouseDatabase(sha), 'ldj_spike_aaaaaaaaaaaa');
    assert.equal(names.instanceDatabase(id), `ld_spike_${id}`);
    assert.equal(names.processName(id, 'api'), `spike-${id}-api`);
    assert.equal(
        databaseIdentifier(names.parentDatabase(sha), 'spike'),
        '"ldp_spike_aaaaaaaaaaaa"',
    );
    assert.throws(
        () => databaseIdentifier(names.parentDatabase(sha), ''),
        /outside/,
    );
    assert.equal(postgresPort('15433', 'spike'), 15433);
    assert.equal(postgresPort('15433', 'spike', 15433), 15433);
    assert.throws(() => postgresPort('15434', 'spike', 15433), /LDENV_PG_PORT/);
});

test('namespace collisions require exact home ownership', () => {
    const first = path.join(os.tmpdir(), '.ldenv-spike');
    const second = path.join(os.tmpdir(), 'spike');
    assert.equal(namespaceForHome(first), namespaceForHome(second));
    assert.equal(matchesHomeLabel(canonicalHome(first), first), true);
    assert.equal(matchesHomeLabel(canonicalHome(first), second), false);
    assert.equal(matchesHomeLabel(undefined, first), false);
});

test('non-default homes reject absent or invalid Postgres ports and unsafe namespaces', () => {
    for (const value of [undefined, '', '0', '1023', '65536', '1.5', 'nope'])
        assert.throws(() => postgresPort(value, 'spike'), /LDENV_PG_PORT/);
    for (const basename of ['.ldenv-', '---', 'x'.repeat(33)])
        assert.throws(
            () => namespaceForHome(path.join(os.tmpdir(), basename)),
            /namespace basename/,
        );
    assert.throws(() => namespaceForHome(''), /absolute directory/);
});

test('missing namespaced port blocks SQL, start, and down before external actions', async () => {
    const environment: NodeJS.ProcessEnv = {
        ...process.env,
        LDENV_HOME: path.join(os.tmpdir(), '.ldenv-spike-guard'),
    };
    delete environment.LDENV_PG_PORT;
    const script = `
        const assert = require('node:assert/strict');
        const { runner } = require(${JSON.stringify(path.join(__dirname, 'io.ts'))});
        const { sql } = require(${JSON.stringify(path.join(__dirname, 'infra.ts'))});
        const { start, down } = require(${JSON.stringify(path.join(__dirname, 'lifecycle.ts'))});
        runner.run = async () => { throw new Error('External command was called'); };
        Promise.all([
            assert.rejects(sql('/tmp', 'SELECT 1'), /LDENV_PG_PORT/),
            assert.rejects(start({}), /LDENV_PG_PORT/),
            assert.rejects(down({}), /LDENV_PG_PORT/),
        ]).catch(error => { console.error(error); process.exitCode = 1; });
    `;
    await promisify(execFile)(
        process.execPath,
        ['--require', require.resolve('tsx/cjs'), '-e', script],
        { env: environment },
    );
});
