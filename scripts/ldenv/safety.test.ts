import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sharedServices, type Compose, type Container } from './infra';
import { Runner, runner } from './io';

const config: Compose = {
    services: { storage: {}, 'headless-browser': {}, mailpit: {}, nats: {} },
};
const container = (service: string, running: boolean): Container => ({
    Id: `${service}-owned-id`,
    Name: `/ld-shared-${service}-1`,
    State: { Running: running, Status: running ? 'running' : 'exited' },
    Config: {
        Labels: {
            'com.docker.compose.project': 'ld-shared',
            'com.docker.compose.service': service,
        },
        Image: 'example',
    },
    Mounts: [],
    NetworkSettings: { Ports: {}, Networks: {} },
});

test('shared services only inspect existing containers and start stopped IDs', async () => {
    const calls: string[][] = [];
    const original = runner.run;
    runner.run = async (command, args) => {
        calls.push([command, ...args]);
        if (args[0] === 'ps') return 'id1\nid2\nid3\nid4';
        if (args[0] === 'inspect')
            return JSON.stringify(
                Object.keys(config.services).map((name) =>
                    container(name, name !== 'storage'),
                ),
            );
        if (args[0] === 'start') return 'started';
        throw new Error('Unexpected mutation');
    };
    try {
        const services = await sharedServices('/tmp', config, true);
        assert.equal(
            services.every((service) => service.running),
            true,
        );
        assert.deepEqual(
            calls.filter((call) => call[1] === 'start'),
            [['docker', 'start', 'storage-owned-id']],
        );
        assert.equal(
            calls.some(
                (call) =>
                    call.includes('compose') ||
                    call.includes('stop') ||
                    call.includes('rm'),
            ),
            false,
        );
    } finally {
        runner.run = original;
    }
});
test('missing shared infrastructure fails without provisioning it', async () => {
    const original = runner.run;
    const calls: string[][] = [];
    runner.run = async (command, args) => {
        calls.push([command, ...args]);
        return '';
    };
    try {
        await assert.rejects(
            sharedServices('/tmp', config, true),
            /Provision shared infrastructure separately/,
        );
        assert.equal(calls.length, 1);
        assert.equal(calls[0][1], 'ps');
    } finally {
        runner.run = original;
    }
});
test('command errors and private logs redact licence and encryption secrets', async () => {
    const executor = new Runner();
    executor.protect({
        LIGHTDASH_LICENSE_KEY: 'test-license',
        LIGHTDASH_SECRET: 'test-secret',
    });
    assert.equal(
        executor.redact('test-license and test-secret'),
        '[REDACTED] and [REDACTED]',
    );
    await assert.rejects(
        executor.run(
            process.execPath,
            [
                '-e',
                'process.stderr.write(process.env.LIGHTDASH_LICENSE_KEY);process.exit(1)',
            ],
            { cwd: '/tmp', env: { LIGHTDASH_LICENSE_KEY: 'test-license' } },
        ),
        (error: Error) =>
            error.message.includes('[REDACTED]') &&
            !error.message.includes('test-license'),
    );
});
