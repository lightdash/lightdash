import {
    AuthorizationError,
    NotFoundError,
    ProjectType,
    SupportedDbtVersions,
    UnexpectedGitError,
    UnexpectedServerError,
    type ExploreError,
    WarehouseTypes,
} from '@lightdash/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { createServer, type Server } from 'http';
import os from 'os';
import path from 'path';
import simpleGit, { GitError } from 'simple-git';
import { pathToFileURL } from 'url';
import { DbtCliClient } from '../dbt/dbtCliClient';
import Logger from '../logging/logger';
import { warehouseClientMock } from '../utils/QueryBuilder/MetricQueryBuilder.mock';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtGitProjectAdapter } from './dbtGitProjectAdapter';
import { gitErrorHandler } from './gitRepository';
import { configureDbtGitProjectCache } from './dbtGitProjectCache';
import { inspectDbtGitProject } from './dbtGitProjectInspection';

const TOKEN_URL =
    'https://lightdash:ghp_secret_token_123@github.com/org/repo.git';

const GIT_STDERR_WITH_TOKEN = `Cloning into '/tmp/git_abc'...\nfatal: Authentication failed for '${TOKEN_URL}/'\n`;

describe('gitErrorHandler', () => {
    it('should strip credentials from stderr on the authentication failed branch', () => {
        try {
            gitErrorHandler(new Error(GIT_STDERR_WITH_TOKEN), 'org/repo');
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(AuthorizationError);
            const serialized = JSON.stringify(e);
            expect(serialized).not.toContain('ghp_secret_token_123');
            expect(serialized).toContain('//*****@github.com');
        }
    });

    it('should strip credentials from stderr on the fallback branch', () => {
        try {
            gitErrorHandler(
                new Error(
                    `fatal: unable to access '${TOKEN_URL}/': Could not resolve host`,
                ),
                'org/repo',
            );
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(UnexpectedGitError);
            expect((e as Error).message).not.toContain('ghp_secret_token_123');
            expect((e as Error).message).toContain('//*****@github.com');
        }
    });

    it('should strip credentials when the thrown value is not an Error', () => {
        try {
            gitErrorHandler(GIT_STDERR_WITH_TOKEN, 'org/repo');
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(UnexpectedServerError);
            expect((e as Error).message).not.toContain('ghp_secret_token_123');
            expect((e as Error).message).toContain('//*****@github.com');
        }
    });

    it('should strip credentials from stderr on the GitError branch', () => {
        try {
            gitErrorHandler(
                new GitError(
                    { commands: ['clone', TOKEN_URL] } as never,
                    `Cloning into '/tmp/git_abc'...\nfatal: unable to access '${TOKEN_URL}/': server certificate verification failed\n`,
                ),
                'org/repo',
            );
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(UnexpectedGitError);
            expect((e as Error).message).not.toContain('ghp_secret_token_123');
            expect((e as Error).message).toContain('//*****@github.com');
        }
    });

    it('should return a NotFoundError without stderr for unknown repositories', () => {
        try {
            gitErrorHandler(
                new Error(
                    "remote: Repository not found.\nfatal: repository 'https://github.com/org/repo.git/' not found",
                ),
                'org/repo',
            );
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(NotFoundError);
            expect((e as Error).message).toContain(
                'Could not find git repository "org/repo"',
            );
        }
    });
});

describe('Git explore compilation', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(['prepareExploreStream', 'compileAllExplores'] as const)(
        '%s refreshes the checkout before preparing the compile',
        async (method) => {
            const adapter = Object.create(
                DbtGitProjectAdapter.prototype,
            ) as DbtGitProjectAdapter;
            const refresh = vi.fn(async () => undefined);
            Object.defineProperty(adapter, 'refreshRepo', { value: refresh });
            const explore: ExploreError = {
                name: 'orders',
                label: 'Orders',
                errors: [],
            };
            const prepare = vi
                .mocked(
                    vi.spyOn(
                        DbtBaseProjectAdapter.prototype,
                        'prepareExploreStream',
                    ),
                )
                .mockImplementation(async () => {
                    expect(refresh).toHaveBeenCalledTimes(1);
                    return (async function* stream() {
                        yield explore;
                    })();
                });

            const compileOptions = { unnestRepeatedColumns: true };
            const result = await adapter[method](
                undefined,
                false,
                true,
                compileOptions,
            );
            const collected = [];
            for await (const item of result) collected.push(item);

            expect(collected).toEqual([explore]);
            expect(prepare).toHaveBeenCalledExactlyOnceWith(
                undefined,
                false,
                true,
                compileOptions,
            );
            expect(refresh).toHaveBeenCalledTimes(1);
        },
    );
});
describe('inspectDbtGitProject', () => {
    it('finds nested credentials and accounts for every filesystem entry', async () => {
        const root = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt-git-inspection-test-'),
        );
        const nested = path.join(root, 'dbt_packages', 'dependency');
        const gitDirectory = path.join(nested, '.git');
        const objectsDirectory = path.join(gitDirectory, 'objects');
        const paths = [
            root,
            path.join(root, 'dbt_packages'),
            nested,
            gitDirectory,
            objectsDirectory,
            path.join(gitDirectory, 'config'),
            path.join(objectsDirectory, 'object'),
            path.join(root, 'model.sql'),
        ];
        try {
            await fs.mkdir(objectsDirectory, { recursive: true });
            await fs.writeFile(
                path.join(gitDirectory, 'config'),
                'url = https://user:secret@example.com/repo.git\n',
            );
            await fs.writeFile(path.join(objectsDirectory, 'object'), 'data');
            await fs.writeFile(path.join(root, 'model.sql'), 'select 1\n');
            const expectedSize = (
                await Promise.all(paths.map((entry) => fs.lstat(entry)))
            ).reduce((total, stat) => total + stat.size, 0);

            const inspection = await inspectDbtGitProject(root);

            expect(inspection).toMatchObject({
                containsCredentials: true,
                sizeBytes: expectedSize,
            });
            expect(inspection.durationMs).toBeGreaterThanOrEqual(0);
        } finally {
            await fs.rm(root, { recursive: true, force: true });
        }
    });
});

describe('DbtGitProjectAdapter cache', () => {
    const temporaryDirectories: string[] = [];
    const servers: Server[] = [];
    let installDeps: ReturnType<typeof vi.spyOn>;
    let getDbtManifest: ReturnType<typeof vi.spyOn>;

    const createRemote = async (files: Record<string, string>) => {
        const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-git-test-'));
        temporaryDirectories.push(root);
        const remote = path.join(root, 'remote.git');
        const source = path.join(root, 'source');
        await fs.mkdir(remote);
        await fs.mkdir(source);
        await simpleGit(remote).init(true, {
            '--bare': null,
            '--initial-branch': 'main',
        });
        const git = simpleGit(source);
        await git.init(false, { '--initial-branch': 'main' });
        await git.cwd(source).addConfig('user.email', 'test@lightdash.com');
        await git.cwd(source).addConfig('user.name', 'Lightdash Test');
        await Promise.all(
            Object.entries(files).map(async ([name, content]) => {
                const filePath = path.join(source, name);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, content);
            }),
        );
        await git.cwd(source).add('.');
        await git.cwd(source).commit('initial');
        await git.cwd(source).addRemote('origin', remote);
        await git.cwd(source).push('origin', 'main');
        return { remote, source };
    };

    const commitRemote = async (
        source: string,
        files: Record<string, string | null>,
    ) => {
        await Promise.all(
            Object.entries(files).map(async ([name, content]) => {
                const filePath = path.join(source, name);
                if (content === null) {
                    await fs.rm(filePath, { force: true });
                } else {
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    await fs.writeFile(filePath, content);
                }
            }),
        );
        const git = simpleGit(source);
        await git.add('.');
        await git.commit('update');
        await git.push('origin', 'main');
    };

    const serveRemote = async (
        root: string,
        authentication: { expected: string; received: string[] },
    ) => {
        const server = createServer((request, response) => {
            const received = request.headers.authorization ?? '';
            authentication.received.push(received);
            if (received !== authentication.expected) {
                response.writeHead(401, {
                    'WWW-Authenticate': 'Basic realm="git"',
                });
                response.end();
                return;
            }
            const requestUrl = new URL(request.url ?? '/', 'http://localhost');
            const backend = spawn('git', ['http-backend'], {
                env: {
                    ...process.env,
                    GIT_PROJECT_ROOT: root,
                    GIT_HTTP_EXPORT_ALL: '1',
                    PATH_INFO: requestUrl.pathname,
                    QUERY_STRING: requestUrl.search.slice(1),
                    REQUEST_METHOD: request.method ?? 'GET',
                    CONTENT_TYPE: request.headers['content-type'] ?? '',
                    CONTENT_LENGTH: request.headers['content-length'] ?? '0',
                    REMOTE_ADDR: request.socket.remoteAddress ?? '',
                },
            });
            const output: Buffer[] = [];
            backend.stdout.on('data', (chunk: Buffer) => output.push(chunk));
            backend.on('close', (code) => {
                if (code !== 0) {
                    response.writeHead(500);
                    response.end();
                    return;
                }
                const result = Buffer.concat(output);
                const separator = result.indexOf('\r\n\r\n');
                const headers = result.subarray(0, separator).toString('utf8');
                const responseHeaders: Record<string, string> = {};
                let status = 200;
                for (const line of headers.split('\r\n')) {
                    const colon = line.indexOf(':');
                    if (colon !== -1) {
                        const name = line.slice(0, colon);
                        const value = line.slice(colon + 1).trim();
                        if (name.toLowerCase() === 'status') {
                            status = Number.parseInt(value, 10);
                        } else {
                            responseHeaders[name] = value;
                        }
                    }
                }
                response.writeHead(status, responseHeaders);
                response.end(result.subarray(separator + 4));
            });
            request.pipe(backend.stdin);
        });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        servers.push(server);
        const address = server.address();
        if (!address || typeof address === 'string') {
            throw new Error('HTTP Git server has no TCP address');
        }
        return `http://127.0.0.1:${address.port}/remote.git`;
    };

    const createAdapter = (
        remote: string,
        sourceUuid = 'source',
        gitConfigGlobalPath?: string,
        credential?: { token: string; installationId?: string },
        gitBranch = 'main',
        projectDirectorySubPath = '.',
        cacheContext?: { projectType?: ProjectType; jobUuid?: string },
    ) =>
        new DbtGitProjectAdapter({
            warehouseClient: warehouseClientMock,
            remoteRepositoryUrl: remote.includes('://')
                ? remote
                : pathToFileURL(remote).href,
            repository: 'test/repository',
            gitBranch,
            projectDirectorySubPath,
            warehouseCredentials: {
                type: WarehouseTypes.POSTGRES,
                host: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'password',
                dbname: 'postgres',
                schema: 'public',
            },
            targetName: undefined,
            environment: undefined,
            environmentVariableAllowlist: [],
            cachedWarehouse: {
                warehouseCatalog: {},
                onWarehouseCatalogChange: vi.fn(),
            },
            dbtVersion: SupportedDbtVersions.V1_7,
            gitConfigGlobalPath,
            credential,
            cacheIdentity: {
                projectUuid: 'project',
                sourceUuid,
                sourceType: 'additional',
            },
            cacheContext,
        });

    beforeEach(async () => {
        const cacheRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt-adapter-cache-test-'),
        );
        temporaryDirectories.push(cacheRoot);
        configureDbtGitProjectCache({
            root: cacheRoot,
            maxBytes: 1024 * 1024,
            maxAgeMs: 60_000,
            livenessCheck: async (identities) =>
                new Set(
                    identities.map(
                        ({ sourceType, projectUuid, sourceUuid }) =>
                            `${sourceType}:${projectUuid}:${sourceUuid}`,
                    ),
                ),
        });
        installDeps = vi
            .spyOn(DbtCliClient.prototype, 'installDeps')
            .mockResolvedValue(undefined);
        getDbtManifest = vi
            .spyOn(DbtCliClient.prototype, 'getDbtManifest')
            .mockResolvedValue({ manifest: { nodes: {} } } as never);
    });

    afterEach(async () => {
        installDeps.mockRestore();
        getDbtManifest.mockRestore();
        delete process.env.DBT_CACHE_ALLOWLIST_TEST;
        await Promise.all(
            servers.splice(0).map(
                (server) =>
                    new Promise<void>((resolve, reject) => {
                        server.close((error) =>
                            error ? reject(error) : resolve(),
                        );
                    }),
            ),
        );
        await Promise.all(
            temporaryDirectories
                .splice(0)
                .map((directory) =>
                    fs.rm(directory, { recursive: true, force: true }),
                ),
        );
    });

    it('reuses a checkout and a successful no-packages deps marker', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'reused',
            depsMode: 'reused',
        });
        expect(installDeps).toHaveBeenCalledTimes(1);
        await second.destroy();
    });

    it('reports one cache outcome with the actual inspection duration', async () => {
        const cacheOutcomes: unknown[] = [];
        const info = vi
            .spyOn(Logger, 'info')
            .mockImplementation((message: unknown, ...metadata: unknown[]) => {
                if (message === 'dbt.git.cache.outcome') {
                    cacheOutcomes.push(metadata[0]);
                }
                return Logger;
            });
        try {
            const { remote } = await createRemote({
                'dbt_project.yml': 'name: test\n',
            });
            const adapter = createAdapter(remote);
            await adapter.getDbtManifest();
            await adapter.destroy();

            const outcome = adapter.getCacheOutcome();
            expect(outcome).toMatchObject({
                cloneMode: 'fresh',
                depsMode: 'fresh',
                missReason: 'cold',
                retainCheckout: true,
                eligible: true,
                retained: true,
            });
            expect(outcome.inspectionDurationMs).toBeGreaterThanOrEqual(0);
            expect(outcome.cleanupDurationMs).toBeGreaterThanOrEqual(
                outcome.inspectionDurationMs,
            );
            expect(cacheOutcomes).toEqual([outcome]);
        } finally {
            info.mockRestore();
        }
    });

    it('skips preview caching and attributes the cache outcome', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const cacheContext = {
            projectType: ProjectType.PREVIEW,
            jobUuid: 'job',
        };
        const first = createAdapter(
            remote,
            'source',
            undefined,
            undefined,
            'main',
            '.',
            cacheContext,
        );
        await first.getDbtManifest();
        expect(first.getCacheOutcome()).toMatchObject({
            projectUuid: 'project',
            sourceUuid: 'source',
            sourceType: 'additional',
            projectType: ProjectType.PREVIEW,
            jobUuid: 'job',
            missReason: 'preview-project',
            cloneMode: 'fresh',
        });
        await first.destroy();

        const second = createAdapter(
            remote,
            'source',
            undefined,
            undefined,
            'main',
            '.',
            cacheContext,
        );
        await second.getDbtManifest();
        expect(second.getFetchMetrics().cloneMode).toBe('fresh');
        await second.destroy();
    });

    it('sanitizes malformed credential-bearing repository URLs', () => {
        expect(() => createAdapter('https://user:secret@[invalid')).toThrow(
            UnexpectedGitError,
        );
        try {
            createAdapter('https://user:secret@[invalid');
        } catch (error) {
            expect(JSON.stringify(error)).not.toContain('secret');
        }
    });

    it('disables the cache when supplied credentials do not match the URL split', async () => {
        const adapter = createAdapter(
            'https://abc/def@dev.azure.com/org/project/_git/repository',
            'source',
            undefined,
            { token: 'abc/def' },
        );

        expect(adapter.getCacheOutcome().missReason).toBe(
            'credential-url-mismatch',
        );
        expect(path.dirname(adapter.localRepositoryDir)).toBe(os.tmpdir());
        await adapter.destroy();
    });

    it('invalidates deps reuse when an allowlisted value changes', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        process.env.DBT_CACHE_ALLOWLIST_TEST = 'first';
        const first = createAdapter(remote);
        (first.dbtClient as DbtCliClient).environmentVariableAllowlist = [
            'DBT_CACHE_ALLOWLIST_TEST',
        ];
        await first.getDbtManifest();
        await first.destroy();
        process.env.DBT_CACHE_ALLOWLIST_TEST = 'second';
        const second = createAdapter(remote);
        (second.dbtClient as DbtCliClient).environmentVariableAllowlist = [
            'DBT_CACHE_ALLOWLIST_TEST',
        ];
        await second.getDbtManifest();
        expect(second.getFetchMetrics().depsMode).toBe('fresh');
        expect(installDeps).toHaveBeenCalledTimes(2);
        await second.destroy();
    });

    it('reuses populated packages after a successful install', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
            'packages.yml':
                'packages:\n  - package: dbt-labs/dbt_utils\n    version: 1.0.0\n',
        });
        installDeps.mockImplementation(
            async function mockInstall(this: DbtCliClient) {
                await fs.mkdir(
                    path.join(this.dbtProjectDirectory, 'dbt_packages'),
                );
                await fs.writeFile(
                    path.join(this.dbtProjectDirectory, 'package-lock.yml'),
                    'packages: []\n',
                );
            },
        );
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics().depsMode).toBe('reused');
        expect(installDeps).toHaveBeenCalledTimes(1);
        await second.destroy();
    });

    it('keeps hooks and vars Jinja cacheable and invalidates on project config edits', async () => {
        const { remote, source } = await createRemote({
            'dbt_project.yml':
                'name: test\non-run-end: "{{ first_hook() }}"\nvars:\n  start: "{{ env_var(\'START_DATE\') }}"\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'reused',
            depsMode: 'reused',
        });
        await second.destroy();

        await commitRemote(source, {
            'dbt_project.yml':
                'name: test\non-run-end: "{{ second_hook() }}"\nvars:\n  start: "{{ env_var(\'START_DATE\') }}"\n',
        });
        const third = createAdapter(remote);
        await third.getDbtManifest();
        expect(third.getFetchMetrics()).toMatchObject({
            cloneMode: 'reused',
            depsMode: 'fresh',
        });
        expect(installDeps).toHaveBeenCalledTimes(2);
        await third.destroy();
    });

    it.each([
        ['packages.yml', 'packages:\n  - local: "{{ env_var(\'LOCAL\') }}"\n'],
        ['packages.yml', 'packages:\n  - nested:\n      path: ../package\n'],
        [
            'dependencies.yml',
            'projects:\n  - name: package\n    config:\n      local: ../package\n',
        ],
    ])(
        'declines retention for unsafe recursive dependency config in %s',
        async (filename, content) => {
            const { remote } = await createRemote({
                'dbt_project.yml': 'name: test\n',
                [filename]: content,
            });
            const first = createAdapter(remote);
            await first.getDbtManifest();
            await first.destroy();
            const second = createAdapter(remote);
            await second.getDbtManifest();

            expect(second.getFetchMetrics()).toMatchObject({
                cloneMode: 'fresh',
                depsMode: 'fresh',
            });
            await second.destroy();
        },
    );

    it('preserves packages and removes junk for literal metacharacter subpaths', async () => {
        const projectSubPath =
            ' leading /!/hash#/bracket[/question?/star*/ trailing ';
        const { remote } = await createRemote({
            [`${projectSubPath}/dbt_project.yml`]: 'name: test\n',
            [`${projectSubPath}/packages.yml`]:
                'packages:\n  - package: example/package\n',
        });
        installDeps.mockImplementation(
            async function mockInstall(this: DbtCliClient) {
                await fs.mkdir(
                    path.join(this.dbtProjectDirectory, 'dbt_packages'),
                );
                await fs.writeFile(
                    path.join(
                        this.dbtProjectDirectory,
                        'dbt_packages',
                        'installed.sql',
                    ),
                    'select 1\n',
                );
                await fs.writeFile(
                    path.join(this.dbtProjectDirectory, 'package-lock.yml'),
                    'packages: []\n',
                );
            },
        );
        const first = createAdapter(
            remote,
            'source',
            undefined,
            undefined,
            'main',
            projectSubPath,
        );
        await first.getDbtManifest();
        const retainedCheckout = first.localRepositoryDir;
        await first.destroy();
        await fs.writeFile(
            path.join(retainedCheckout, projectSubPath, 'junk.sql'),
            'select 2\n',
        );
        const second = createAdapter(
            remote,
            'source',
            undefined,
            undefined,
            'main',
            projectSubPath,
        );
        await second.getDbtManifest();

        await expect(
            fs.readFile(
                path.join(
                    second.localRepositoryDir,
                    projectSubPath,
                    'dbt_packages',
                    'installed.sql',
                ),
                'utf8',
            ),
        ).resolves.toBe('select 1\n');
        await expect(
            fs.access(
                path.join(
                    second.localRepositoryDir,
                    projectSubPath,
                    'junk.sql',
                ),
            ),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        expect(second.getFetchMetrics().depsMode).toBe('reused');
        await second.destroy();
    });

    it('excludes temporary Git credential paths from dependency identity', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
            'packages.yml': 'packages:\n  - package: example/package\n',
        });
        installDeps.mockImplementation(
            async function mockInstall(this: DbtCliClient) {
                await fs.mkdir(
                    path.join(this.dbtProjectDirectory, 'dbt_packages'),
                );
                await fs.writeFile(
                    path.join(this.dbtProjectDirectory, 'package-lock.yml'),
                    'packages: []\n',
                );
            },
        );
        const credentialConfig = async () => {
            const directory = await fs.mkdtemp(
                path.join(os.tmpdir(), 'dbt-git-credentials-test-'),
            );
            temporaryDirectories.push(directory);
            const configPath = path.join(directory, 'gitconfig');
            await fs.writeFile(
                configPath,
                `[credential]\nhelper = store --file=${path.join(
                    directory,
                    'credentials',
                )}\n`,
            );
            await fs.writeFile(
                path.join(directory, 'credentials'),
                'https://user:same@example.com\n',
            );
            return configPath;
        };
        const first = createAdapter(remote, 'source', await credentialConfig());
        await first.getDbtManifest();
        await first.destroy();
        const second = createAdapter(
            remote,
            'source',
            await credentialConfig(),
        );
        await second.getDbtManifest();
        expect(second.getFetchMetrics().depsMode).toBe('reused');
        expect(installDeps).toHaveBeenCalledTimes(1);
        await second.destroy();
    });

    it('cleans old package state when package inputs and install path change', async () => {
        const { remote, source } = await createRemote({
            'dbt_project.yml':
                'name: test\npackages-install-path: packages_a\n',
            'packages.yml': 'packages:\n  - package: dbt-labs/dbt_utils\n',
            'package-lock.yml': 'packages:\n  - name: dbt_utils\n',
        });
        const observations: Array<{
            oldPackages: boolean;
            packageLock: boolean;
        }> = [];
        installDeps.mockImplementation(
            async function mockInstall(this: DbtCliClient) {
                observations.push({
                    oldPackages: await fs
                        .access(
                            path.join(this.dbtProjectDirectory, 'packages_a'),
                        )
                        .then(() => true)
                        .catch(() => false),
                    packageLock: await fs
                        .access(
                            path.join(
                                this.dbtProjectDirectory,
                                'package-lock.yml',
                            ),
                        )
                        .then(() => true)
                        .catch(() => false),
                });
                if (observations.length === 1) {
                    const packagesDirectory = path.join(
                        this.dbtProjectDirectory,
                        'packages_a',
                    );
                    await fs.mkdir(packagesDirectory);
                    await simpleGit(packagesDirectory).init();
                    await fs.writeFile(
                        path.join(this.dbtProjectDirectory, 'package-lock.yml'),
                        'packages:\n  - name: installed\n',
                    );
                }
            },
        );
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        await commitRemote(source, {
            'dbt_project.yml':
                'name: test\npackages-install-path: packages_b\n',
            'packages.yml': null,
            'package-lock.yml': null,
        });
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'reused',
            depsMode: 'fresh',
        });
        expect(observations[1]).toEqual({
            oldPackages: false,
            packageLock: false,
        });
        await second.destroy();
    });

    it('does not publish a reusable marker after failed deps', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        installDeps.mockRejectedValueOnce(new Error('deps failed'));
        const first = createAdapter(remote);
        await expect(first.getDbtManifest()).rejects.toThrow('deps failed');
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics().depsMode).toBe('fresh');
        expect(installDeps).toHaveBeenCalledTimes(2);
        await second.destroy();
    });

    it('does not fail compilation when a successful deps marker cannot be written', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        installDeps.mockImplementationOnce(
            async function mockInstall(this: DbtCliClient) {
                await fs.mkdir(
                    path.join(
                        path.dirname(this.dbtProjectDirectory),
                        'deps.json.tmp',
                    ),
                );
            },
        );
        const first = createAdapter(remote);
        await expect(first.getDbtManifest()).resolves.toBeDefined();
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'fresh',
            depsMode: 'fresh',
        });
        await second.destroy();
    });

    it('fetches the current branch and keeps retained Git metadata credential-free', async () => {
        const { remote, source } = await createRemote({
            'dbt_project.yml': 'name: test\n',
            'models/value.sql': 'select 1\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        await commitRemote(source, {
            'models/value.sql': 'select 2\n',
        });
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(
            await fs.readFile(
                path.join(second.localRepositoryDir, 'models/value.sql'),
                'utf8',
            ),
        ).toBe('select 2\n');
        const gitConfig = await fs.readFile(
            path.join(second.localRepositoryDir, '.git/config'),
            'utf8',
        );
        expect(gitConfig).not.toMatch(/https?:\/\/[^\s/@]+:[^\s/@]*@/);
        await expect(
            fs.access(
                path.join(second.localRepositoryDir, '.git', 'FETCH_HEAD'),
            ),
        ).rejects.toMatchObject({ code: 'ENOENT' });
        await second.destroy();
    });

    it('rejects option-like branches before running Git or dbt', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });

        expect(() =>
            createAdapter(
                remote,
                'source',
                undefined,
                undefined,
                '--upload-pack=side-effect',
            ),
        ).toThrow(UnexpectedGitError);
        expect(installDeps).not.toHaveBeenCalled();
    });

    it('fetches a retained checkout with the current credentials', async () => {
        const { remote, source } = await createRemote({
            'dbt_project.yml': 'name: test\n',
            'models/value.sql': 'select 1\n',
        });
        const authentication = {
            expected: `Basic ${Buffer.from('user:first').toString('base64')}`,
            received: [] as string[],
        };
        const cleanUrl = await serveRemote(
            path.dirname(remote),
            authentication,
        );
        const first = createAdapter(cleanUrl.replace('://', '://user:first@'));
        await first.getDbtManifest();
        await first.destroy();
        await commitRemote(source, {
            'models/value.sql': 'select 2\n',
        });
        authentication.expected = `Basic ${Buffer.from('user:second').toString(
            'base64',
        )}`;
        authentication.received = [];
        const second = createAdapter(
            cleanUrl.replace('://', '://user:second@'),
        );
        await second.getDbtManifest();
        expect(second.getFetchMetrics().cloneMode).toBe('reused');
        expect(
            await fs.readFile(
                path.join(second.localRepositoryDir, 'models/value.sql'),
                'utf8',
            ),
        ).toBe('select 2\n');
        expect(authentication.received).toContain(authentication.expected);
        expect(authentication.received).not.toContain(
            `Basic ${Buffer.from('user:first').toString('base64')}`,
        );
        const gitConfig = await fs.readFile(
            path.join(second.localRepositoryDir, '.git/config'),
            'utf8',
        );
        expect(gitConfig).not.toContain('first');
        expect(gitConfig).not.toContain('second');
        await second.destroy();
    });

    it('reuses checkout and dependencies when an installation token and credential store rotate', async () => {
        const { remote, source } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const authentication = {
            expected: `Basic ${Buffer.from('user:first').toString('base64')}`,
            received: [] as string[],
        };
        const cleanUrl = await serveRemote(
            path.dirname(remote),
            authentication,
        );
        const credentialConfig = async (token: string) => {
            const directory = await fs.mkdtemp(
                path.join(os.tmpdir(), 'dbt-git-credentials-test-'),
            );
            temporaryDirectories.push(directory);
            const configPath = path.join(directory, 'gitconfig');
            const credentialsPath = path.join(directory, 'credentials');
            await fs.writeFile(
                configPath,
                `[credential]\nhelper = store --file=${credentialsPath}\n`,
            );
            await fs.writeFile(
                credentialsPath,
                `https://user:${token}@example.com\n`,
            );
            return configPath;
        };
        const first = createAdapter(
            cleanUrl.replace('://', '://user:first@'),
            'source',
            await credentialConfig('first'),
            { token: 'first', installationId: 'installation' },
        );
        await first.getDbtManifest();
        await first.destroy();
        await commitRemote(source, {
            'models/value.sql': 'select 2\n',
        });
        authentication.expected = `Basic ${Buffer.from('user:second').toString(
            'base64',
        )}`;
        authentication.received = [];
        const second = createAdapter(
            cleanUrl.replace('://', '://user:second@'),
            'source',
            await credentialConfig('second'),
            { token: 'second', installationId: 'installation' },
        );
        await second.getDbtManifest();

        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'reused',
            depsMode: 'reused',
        });
        expect(installDeps).toHaveBeenCalledTimes(1);
        expect(authentication.received).toContain(authentication.expected);
        await second.destroy();
    });

    it('invalidates dependencies when a long-lived token rotates', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const authentication = {
            expected: `Basic ${Buffer.from('user:first').toString('base64')}`,
            received: [] as string[],
        };
        const cleanUrl = await serveRemote(
            path.dirname(remote),
            authentication,
        );
        const first = createAdapter(
            cleanUrl.replace('://', '://user:first@'),
            'source',
            undefined,
            { token: 'first' },
        );
        await first.getDbtManifest();
        await first.destroy();
        authentication.expected = `Basic ${Buffer.from('user:second').toString(
            'base64',
        )}`;
        authentication.received = [];
        const second = createAdapter(
            cleanUrl.replace('://', '://user:second@'),
            'source',
            undefined,
            { token: 'second' },
        );
        await second.getDbtManifest();

        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'reused',
            depsMode: 'fresh',
        });
        expect(installDeps).toHaveBeenCalledTimes(2);
        await second.destroy();
    });

    it('uses a new temporary clone when a retained checkout cannot reset', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        const retainedCheckout = first.localRepositoryDir;
        await first.destroy();
        await fs.rm(path.join(retainedCheckout, '.git'), {
            recursive: true,
            force: true,
        });
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics().cloneMode).toBe('fresh');
        expect(second.localRepositoryDir).not.toBe(retainedCheckout);
        await second.destroy();
    });

    it('sanitizes a credentialed cached refresh error before warning', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const authentication = {
            expected: `Basic ${Buffer.from('user:secret-token').toString(
                'base64',
            )}`,
            received: [] as string[],
        };
        const cleanUrl = await serveRemote(
            path.dirname(remote),
            authentication,
        );
        const credentialedUrl = cleanUrl.replace(
            '://',
            '://user:secret-token@',
        );
        const first = createAdapter(credentialedUrl, 'source', undefined, {
            token: 'secret-token',
        });
        await first.getDbtManifest();
        const retainedCheckout = first.localRepositoryDir;
        await first.destroy();
        await fs.rm(path.join(retainedCheckout, '.git'), {
            recursive: true,
            force: true,
        });
        const refreshWarnings: unknown[] = [];
        const warn = vi
            .spyOn(Logger, 'warn')
            .mockImplementation((message: unknown, ...metadata: unknown[]) => {
                if (
                    message ===
                    'Cached Git checkout refresh failed; using a fresh clone'
                ) {
                    refreshWarnings.push(metadata[0]);
                }
                return Logger;
            });
        try {
            const second = createAdapter(credentialedUrl, 'source', undefined, {
                token: 'secret-token',
            });
            await second.getDbtManifest();
            expect(refreshWarnings).toHaveLength(1);
            expect(JSON.stringify(refreshWarnings)).not.toContain(
                'secret-token',
            );
            expect(JSON.stringify(refreshWarnings)).not.toContain('task');
            await second.destroy();
        } finally {
            warn.mockRestore();
        }
    });

    it('falls back to a fresh clone when retained metadata is corrupt', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        const entryDirectory = path.dirname(first.localRepositoryDir);
        await first.destroy();
        await fs.writeFile(path.join(entryDirectory, 'metadata.json'), '{}');
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics().cloneMode).toBe('fresh');
        await second.destroy();
    });

    it('falls back to a temporary clone when the cache root is unusable', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const cacheRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt-adapter-invalid-cache-test-'),
        );
        temporaryDirectories.push(cacheRoot);
        await fs.chmod(cacheRoot, 0o755);
        configureDbtGitProjectCache({
            root: cacheRoot,
            maxBytes: 1024 * 1024,
            maxAgeMs: 60_000,
            livenessCheck: async () => new Set(),
        });
        const adapter = createAdapter(remote);
        await adapter.getDbtManifest();
        expect(adapter.getFetchMetrics().cloneMode).toBe('fresh');
        expect(path.dirname(adapter.localRepositoryDir)).toBe(os.tmpdir());
        await adapter.destroy();
    });

    it('propagates a failed fresh clone after cache fallback', async () => {
        const cacheOutcomes: unknown[] = [];
        const info = vi
            .spyOn(Logger, 'info')
            .mockImplementation((message: unknown, ...metadata: unknown[]) => {
                if (message === 'dbt.git.cache.outcome') {
                    cacheOutcomes.push(metadata[0]);
                }
                return Logger;
            });
        try {
            const missingRemote = path.join(
                os.tmpdir(),
                `missing-dbt-git-${Date.now()}.git`,
            );
            const adapter = createAdapter(missingRemote);
            await expect(adapter.getDbtManifest()).rejects.toBeInstanceOf(
                UnexpectedGitError,
            );
            await adapter.destroy();

            expect(adapter.getCacheOutcome()).toMatchObject({
                missReason: 'cold',
                fallbackReason: 'cache-clone-failed',
                eligible: null,
                retained: false,
            });
            expect(cacheOutcomes).toHaveLength(1);
        } finally {
            info.mockRestore();
        }
    });

    it('uses a fresh checkout while another adapter owns the cache lease', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics().cloneMode).toBe('fresh');
        expect(second.localRepositoryDir).not.toBe(first.localRepositoryDir);
        await first.destroy();
        await second.destroy();
        const third = createAdapter(remote);
        await third.getDbtManifest();
        expect(third.getFetchMetrics().cloneMode).toBe('reused');
        await third.destroy();
    });

    it('releases the checkout lease when base cleanup fails', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
        });
        const cleanup = vi
            .spyOn(DbtCliClient.prototype, 'cleanup')
            .mockRejectedValueOnce(new Error('cleanup failed'));
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await expect(first.destroy()).rejects.toThrow('cleanup failed');
        cleanup.mockRestore();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics().cloneMode).toBe('reused');
        await second.destroy();
    });

    it('declines retention when dependency Git metadata contains credentials', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\n',
            'packages.yml': 'packages:\n  - package: example/package\n',
        });
        installDeps.mockImplementation(
            async function mockInstall(this: DbtCliClient) {
                const gitDirectory = path.join(
                    this.dbtProjectDirectory,
                    'dbt_packages',
                    'package',
                    '.git',
                );
                await fs.mkdir(gitDirectory, { recursive: true });
                await fs.writeFile(
                    path.join(gitDirectory, 'config'),
                    '[remote "origin"]\nurl = https://user:secret@example.com/repo.git\n',
                );
            },
        );
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics().cloneMode).toBe('fresh');
        await second.destroy();
    });

    it('declines retention for an unsafe package install path', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml': 'name: test\npackages-install-path: .\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'fresh',
            depsMode: 'fresh',
        });
        expect(installDeps).toHaveBeenCalledTimes(2);
        await second.destroy();
    });

    it('declines retention for a glob package install path', async () => {
        const { remote } = await createRemote({
            'dbt_project.yml':
                'name: test\npackages-install-path: "dbt*packages"\n',
        });
        const first = createAdapter(remote);
        await first.getDbtManifest();
        await first.destroy();
        const second = createAdapter(remote);
        await second.getDbtManifest();
        expect(second.getFetchMetrics()).toMatchObject({
            cloneMode: 'fresh',
            depsMode: 'fresh',
        });
        await second.destroy();
    });
});
