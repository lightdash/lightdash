import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { test } from 'node:test';
import packageJson from '../package.json' with { type: 'json' };
import cliPackageJson from '../packages/cli/package.json' with { type: 'json' };
import commonPackageJson from '../packages/common/package.json' with { type: 'json' };

const pnpmExecutable =
    process.env.npm_execpath ?? assert.fail('Run this test with pnpm exec tsx');

// These versions already exist on npm, which rejects any escaped upload.
const version = '1.0.0';
const workflow = readFileSync('.github/workflows/release.yml', 'utf8');
const publishStep = workflow.slice(
    workflow.indexOf('      - name: Publish npm packages\n'),
);
const configuredTimeout = Number(
    publishStep.match(/PNPM_CONFIG_PUBLISH_WAIT_TIMEOUT: ['"]?(\d+)/)?.[1] ?? 0,
);

async function publishFixture({
    metadataReadyAfter,
    timeout,
}: {
    metadataReadyAfter: number;
    timeout: number;
}) {
    const directory = mkdtempSync(join(tmpdir(), 'publish-availability-'));
    const events: string[] = [];
    let metadataRequests = 0;
    let tarballRequests = 0;
    let dependencyAvailable = false;
    let registry = '';

    const server = createServer((request, response) => {
        const url = decodeURIComponent(request.url ?? '');
        const expectedPath =
            request.method === 'HEAD'
                ? /^\/tarballs\/@lightdash\/(common|cli)\.tgz$/
                : /^\/@lightdash\/(common|cli)$/;
        if (
            !expectedPath.test(url) ||
            !['GET', 'HEAD', 'PUT'].includes(request.method ?? '')
        ) {
            events.push(`unexpected ${request.method} ${url}`);
            response.writeHead(404).end();
            return;
        }
        const dependency = url.includes('common');
        if (request.method === 'PUT') {
            request.resume();
            events.push(dependency ? 'upload dependency' : 'upload consumer');
            response.writeHead(!dependency && !dependencyAvailable ? 409 : 201);
            response.end(JSON.stringify({ ok: true }));
            return;
        }
        if (request.method === 'HEAD') {
            tarballRequests += Number(dependency);
            const available = !dependency || tarballRequests >= 2;
            if (dependency && available) {
                dependencyAvailable = true;
                events.push('dependency available');
            }
            response.writeHead(available ? 200 : 404).end();
            return;
        }
        metadataRequests += Number(dependency);
        const name = dependency ? '@lightdash/common' : '@lightdash/cli';
        const available = !dependency || metadataRequests >= metadataReadyAfter;
        response.setHeader('content-type', 'application/json');
        response.end(
            JSON.stringify({
                name,
                'dist-tags': available ? { latest: version } : {},
                versions: available
                    ? {
                          [version]: {
                              name,
                              version,
                              dist: {
                                  tarball: `${registry}/tarballs/${name}.tgz`,
                              },
                          },
                      }
                    : {},
            }),
        );
    });
    await new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve(undefined)),
    );
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    registry = `http://127.0.0.1:${address.port}`;

    writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({
            private: true,
            scripts: {
                'release-packages': packageJson.scripts['release-packages'],
            },
        }),
    );
    writeFileSync(
        join(directory, 'pnpm-workspace.yaml'),
        "packages:\n  - 'packages/*'\nverifyDepsBeforeRun: false\n",
    );
    const releaseScripts = {
        common: commonPackageJson.scripts.release,
        cli: cliPackageJson.scripts.release,
    };
    for (const [name, release] of Object.entries(releaseScripts)) {
        const path = join(directory, 'packages', name);
        mkdirSync(path, { recursive: true });
        writeFileSync(
            join(path, 'package.json'),
            JSON.stringify({
                name: `@lightdash/${name}`,
                version,
                scripts: {
                    release: `${release} --no-provenance --registry=${registry}`,
                },
                ...(name === 'cli'
                    ? { dependencies: { '@lightdash/common': 'workspace:*' } }
                    : {}),
            }),
        );
    }

    try {
        const result = await new Promise<{
            code: number | null;
            output: string;
        }>((resolve, reject) => {
            const child = spawn(pnpmExecutable, ['release-packages'], {
                cwd: directory,
                env: {
                    PATH: `${dirname(pnpmExecutable)}${delimiter}${process.env.PATH ?? ''}`,
                    HOME: directory,
                    XDG_CONFIG_HOME: join(directory, 'config'),
                    XDG_CACHE_HOME: join(directory, 'cache'),
                    XDG_DATA_HOME: join(directory, 'data'),
                    XDG_STATE_HOME: join(directory, 'state'),
                    TMPDIR: directory,
                    PNPM_CONFIG_PUBLISH_WAIT_TIMEOUT: String(timeout),
                },
                timeout: 40_000,
            });
            let output = '';
            child.stdout.on('data', (data: Buffer) => {
                output += data.toString();
            });
            child.stderr.on('data', (data: Buffer) => {
                output += data.toString();
            });
            child.on('error', reject);
            child.on('close', (code) => resolve({ code, output }));
        });
        return { ...result, events };
    } finally {
        await new Promise((resolve) => server.close(() => resolve(undefined)));
        rmSync(directory, { recursive: true, force: true });
    }
}

test('waits for dependency metadata and tarball before publishing its consumer', async () => {
    const result = await publishFixture({
        metadataReadyAfter: 2,
        timeout: Math.min(configuredTimeout, 20_000),
    });
    assert.equal(result.code, 0, result.output);
    assert.deepEqual(result.events, [
        'upload dependency',
        'dependency available',
        'upload consumer',
    ]);
});

test('availability timeout stops publishing before the consumer upload', async () => {
    const result = await publishFixture({
        metadataReadyAfter: Infinity,
        timeout: 100,
    });
    assert.notEqual(result.code, 0, result.output);
    assert.match(result.output, /ERR_PNPM_PUBLISH_AVAILABILITY_TIMEOUT/);
    assert.deepEqual(result.events, ['upload dependency']);
});
