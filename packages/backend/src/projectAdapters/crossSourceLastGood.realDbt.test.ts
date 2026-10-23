import {
    DbtError,
    getExternalModelNodesFromManifest,
    SupportedDbtVersions,
    type DbtManifest,
    type DbtRawModelNode,
} from '@lightdash/common';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { scanDbtProject } from '../dbt/dbtProjectScan';
import Logger from '../logging/logger';
import {
    resolveCrossSourceManifests,
    type CrossSourceCatalog,
    type CrossSourceFetchTask,
} from './crossSourceRefs';

const executable = process.env.LIGHTDASH_TEST_DBT_EXECUTABLES?.split(',')
    .find((entry) => entry.startsWith('1.12='))
    ?.slice('1.12='.length);

const dbtFailure = async (operation: Promise<unknown>): Promise<string> => {
    try {
        await operation;
    } catch (error) {
        expect(error).toBeInstanceOf(DbtError);
        if (error instanceof DbtError)
            return [
                error.message,
                ...(error.logs ?? []).map((log) => log.info.msg),
            ].join('\n');
        throw error;
    }
    throw new Error('Expected dbt to reject the reference');
};

describe.skipIf(!executable)('last-good manifests with real dbt 1.12', () => {
    let directory: string;
    let originalPath: string | undefined;
    const clients: DbtCliClient[] = [];
    let cache: CrossSourceCatalog[];

    const createTask = async (
        projectName: string,
        models: Record<string, string>,
        schema: string,
    ): Promise<CrossSourceFetchTask<string>> => {
        const root = await fs.mkdtemp(path.join(directory, `${projectName}-`));
        await fs.mkdir(path.join(root, 'models'));
        await fs.writeFile(
            path.join(root, 'dbt_project.yml'),
            `name: ${projectName}\nversion: '1.0.0'\nconfig-version: 2\nprofile: last_good\n`,
        );
        await fs.writeFile(path.join(root, 'models', 'schema.yml'), schema);
        await Promise.all(
            Object.entries(models).map(([name, sql]) =>
                fs.writeFile(path.join(root, 'models', `${name}.sql`), sql),
            ),
        );
        const client = new DbtCliClient({
            dbtProjectDirectory: root,
            dbtProfilesDirectory: directory,
            environment: {},
            environmentVariableAllowlist: [],
            explicitCredentials: true,
            dbtVersion: SupportedDbtVersions.V1_12,
            partialParseBaselinePath: null,
        });
        clients.push(client);
        return {
            key: projectName,
            context: projectName,
            prepare: async () => scanDbtProject(root),
            fetch: async (options) => ({
                ...(await client.getDbtManifest(options)),
                timings: { gitRefreshMs: null, depsMs: null, manifestMs: 0 },
            }),
        };
    };

    const ring = async () =>
        Promise.all([
            createTask(
                'proj_alpha',
                {
                    alpha_base: 'select 1 as id',
                    alpha_report:
                        "select * from {{ ref('proj_beta', 'measure') }}",
                },
                'version: 2\nmodels:\n  - name: alpha_base\n    access: public\n  - name: alpha_report\n    access: protected\n',
            ),
            createTask(
                'proj_beta',
                {
                    measure_v2: 'select 2 as id',
                    measure_v3: 'select 3 as id',
                    beta_report:
                        "select * from {{ ref('proj_alpha', 'alpha_base') }}",
                },
                'version: 2\nmodels:\n  - name: measure\n    access: public\n    latest_version: 2\n    versions:\n      - v: 2\n      - v: 3\n  - name: beta_report\n    access: protected\n',
            ),
        ]);

    beforeAll(async () => {
        originalPath = process.env.PATH;
        directory = await fs.mkdtemp(path.join(os.tmpdir(), 'last-good-dbt-'));
        await fs.symlink(
            path.resolve(executable!),
            path.join(directory, 'dbt1.12'),
        );
        process.env.PATH = `${directory}${path.delimiter}${originalPath ?? ''}`;
        await fs.writeFile(
            path.join(directory, 'profiles.yml'),
            'config:\n  send_anonymous_usage_stats: false\nlast_good:\n  target: dev\n  outputs:\n    dev:\n      type: postgres\n      host: 127.0.0.1\n      port: 1\n      user: sim\n      password: sim\n      dbname: sim\n      schema: sim\n      threads: 1\n      sslmode: disable\n',
        );
        const seeds = await Promise.all([
            createTask(
                'proj_alpha',
                { alpha_base: 'select 1 as id' },
                'version: 2\nmodels:\n  - name: alpha_base\n    access: public\n',
            ),
            createTask(
                'proj_beta',
                { measure_v3: 'select 3 as id' },
                'version: 2\nmodels:\n  - name: measure\n    access: public\n    latest_version: 3\n    versions:\n      - v: 3\n',
            ),
        ]);
        cache = await Promise.all(
            seeds.map(async (task) => ({
                key: task.key,
                projectName: task.key,
                nodes: getExternalModelNodesFromManifest(
                    (await task.fetch({ externalNodes: [] })).manifest,
                ),
                referencedProjects: [],
            })),
        );
    }, 120000);

    afterAll(async () => {
        if (originalPath === undefined) delete process.env.PATH;
        else process.env.PATH = originalPath;
        await Promise.all(clients.map((client) => client.cleanup()));
        if (directory) await fs.rm(directory, { recursive: true, force: true });
    });

    const dependencies = (manifest: DbtManifest, id: string) =>
        (manifest.nodes[id] as DbtRawModelNode).depends_on?.nodes;

    it('keeps seeded v3 authoritative over disk v2 in an acyclic project ring', async () => {
        const original = JSON.stringify(cache);
        expect(
            cache
                .flatMap((entry) => entry.nodes)
                .every((node) => node.access === 'public'),
        ).toBe(true);
        const result = await resolveCrossSourceManifests({
            tasks: await ring(),
            enabled: true,
            concurrency: 2,
            cache,
        });
        expect(result.results).toHaveLength(2);
        const alpha = result.results.find(
            (entry) => entry.task.key === 'proj_alpha',
        )!;
        const beta = result.results.find(
            (entry) => entry.task.key === 'proj_beta',
        )!;
        expect(
            dependencies(
                alpha.result.manifest,
                'model.proj_alpha.alpha_report',
            ),
        ).toEqual(['model.proj_beta.measure.v3']);
        expect(
            dependencies(beta.result.manifest, 'model.proj_beta.beta_report'),
        ).toEqual(['model.proj_alpha.alpha_base']);
        expect(
            (
                beta.result.manifest.nodes[
                    'model.proj_beta.measure.v2'
                ] as DbtRawModelNode
            ).latest_version,
        ).toBe(2);
        expect(JSON.stringify(cache)).toBe(original);
    }, 120000);

    it('warns with unseeded upstream names and rejects an empty store', async () => {
        const warn = vi.spyOn(Logger, 'warn');
        const tasks = (await ring()).map((task) => ({
            ...task,
            fetch: vi.fn(task.fetch),
        }));
        try {
            await expect(
                resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    cache: [],
                }),
            ).rejects.toThrow(/last-good/);
            const warnings = JSON.stringify(warn.mock.calls);
            expect(warnings).toContain('proj_alpha');
            expect(warnings).toContain('proj_beta');
            expect(warnings).toContain('last-good');
            await Promise.all(
                tasks.map(async (task) => {
                    expect(task.fetch).toHaveBeenCalledOnce();
                    await expect(
                        dbtFailure(task.fetch.mock.results[0].value),
                    ).resolves.toMatch(/which was not found/);
                }),
            );
        } finally {
            warn.mockRestore();
        }
    }, 120000);

    it.each(['protected', 'private', undefined] as const)(
        'does not inject a stored model with access=%s',
        async (access) => {
            const errors: DbtError[] = [];
            const tasks = (await ring()).map((task) => ({
                ...task,
                fetch: async (options: Parameters<typeof task.fetch>[0]) => {
                    try {
                        return await task.fetch(options);
                    } catch (error) {
                        if (error instanceof DbtError) errors.push(error);
                        throw error;
                    }
                },
            }));
            await expect(
                resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    cache: cache.map((entry) => ({
                        ...entry,
                        nodes: entry.nodes.map((node) => {
                            const storedNode = { ...node };
                            if (storedNode.name === 'measure') {
                                if (access === undefined)
                                    Reflect.deleteProperty(
                                        storedNode,
                                        'access',
                                    );
                                else storedNode.access = access;
                            }
                            return storedNode;
                        }),
                    })),
                }),
            ).rejects.toThrow();
            expect(
                errors
                    .flatMap((error) =>
                        (error.logs ?? []).map((log) => log.info.msg),
                    )
                    .join('\n'),
            ).toMatch(/which was not found/);
        },
        120000,
    );

    it('injects only public dependencies from a parsed seed', async () => {
        const provider = await createTask(
            'public_upstream',
            {
                public_base: 'select 1 as id',
                protected_base: 'select 2 as id',
                private_base: 'select 3 as id',
                shared_model:
                    "select * from {{ ref('public_base') }} union all select * from {{ ref('protected_base') }} union all select * from {{ ref('private_base') }}",
            },
            'version: 2\ngroups:\n  - name: core\n    owner:\n      name: Test owner\nmodels:\n  - name: public_base\n    access: public\n  - name: protected_base\n  - name: private_base\n    access: private\n    group: core\n  - name: shared_model\n    access: public\n    group: core\n',
        );
        const nodes = getExternalModelNodesFromManifest(
            (await provider.fetch({ externalNodes: [] })).manifest,
        );
        const storedRoot = nodes.find((node) => node.name === 'shared_model')!;
        expect(storedRoot.depends_on_nodes).toEqual([
            'model.public_upstream.public_base',
            'model.public_upstream.protected_base',
            'model.public_upstream.private_base',
        ]);
        const consumer = await createTask(
            'public_consumer',
            {
                report: "select * from {{ ref('public_upstream', 'shared_model') }}",
            },
            'version: 2\nmodels:\n  - name: report\n',
        );
        const fetch = vi.fn(consumer.fetch);
        const resolution = await resolveCrossSourceManifests({
            tasks: [{ ...consumer, fetch }, provider],
            enabled: true,
            concurrency: 2,
            cache: [
                {
                    key: provider.key,
                    projectName: provider.key,
                    referencedProjects: [],
                    nodes,
                },
            ],
        });
        expect(resolution.results).toHaveLength(2);
        const injected = fetch.mock.calls[0][0]?.externalNodes ?? [];
        expect(injected.map((node) => node.name).sort()).toEqual([
            'public_base',
            'shared_model',
        ]);
        expect(injected.every((node) => node.access === 'public')).toBe(true);
        expect(
            injected.find((node) => node.name === 'shared_model')!
                .depends_on_nodes,
        ).toEqual(['model.public_upstream.public_base']);
        expect(storedRoot.depends_on_nodes).toHaveLength(3);
    }, 120000);

    it('fresh-seeds a reversed cold chain once in provider order', async () => {
        const provider = await createTask(
            'cold_provider',
            { shared: 'select 1 as id' },
            'version: 2\nmodels:\n  - name: shared\n    access: public\n',
        );
        const middle = await createTask(
            'cold_middle',
            {
                middle_shared:
                    "select * from {{ ref('cold_provider', 'shared') }}",
            },
            'version: 2\nmodels:\n  - name: middle_shared\n    access: public\n',
        );
        const consumer = await createTask(
            'cold_consumer',
            {
                report: "select * from {{ ref('cold_middle', 'middle_shared') }}",
            },
            'version: 2\nmodels:\n  - name: report\n',
        );
        const fetched: string[] = [];
        const tasks = [consumer, middle, provider].map((task) => ({
            ...task,
            fetch: vi.fn(async (options: Parameters<typeof task.fetch>[0]) => {
                fetched.push(task.key);
                return task.fetch(options);
            }),
        }));
        const result = await resolveCrossSourceManifests({
            tasks,
            enabled: true,
            concurrency: 2,
        });
        expect(fetched).toEqual([
            'cold_provider',
            'cold_middle',
            'cold_consumer',
        ]);
        expect(result.attempts).toBe(3);
        for (const task of tasks) expect(task.fetch).toHaveBeenCalledOnce();
        expect(result.warnings.join(' ')).toContain('cold_provider');
        expect(result.warnings.join(' ')).toContain('cold_middle');
        expect(
            dependencies(
                result.results[0].result.manifest,
                'model.cold_consumer.report',
            ),
        ).toEqual(['model.cold_middle.middle_shared']);
    }, 120000);

    it('resolves explicitly public seed and snapshot projections with native ids', async () => {
        const provider = await createTask(
            'resources',
            { base: 'select 1 as id' },
            'version: 2\nmodels:\n  - name: base\n    access: public\n',
        );
        const root = clients[clients.length - 1].dbtProjectDirectory;
        await fs.mkdir(path.join(root, 'seeds'));
        await fs.mkdir(path.join(root, 'snapshots'));
        await fs.writeFile(path.join(root, 'seeds', 'lookup.csv'), 'id\n1\n');
        await fs.appendFile(
            path.join(root, 'dbt_project.yml'),
            'seeds:\n  resources:\n    +access: public\n',
        );
        await fs.writeFile(
            path.join(root, 'snapshots', 'history.sql'),
            "{% snapshot history %}\n{{ config(target_schema='sim', unique_key='id', strategy='timestamp', updated_at='updated_at', access='public') }}\nselect id, current_timestamp as updated_at from {{ ref('lookup') }}\n{% endsnapshot %}\n",
        );
        const nodes = getExternalModelNodesFromManifest(
            (await provider.fetch({ externalNodes: [] })).manifest,
        );
        expect(nodes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'lookup',
                    resource_type: 'seed',
                    access: 'public',
                }),
                expect.objectContaining({
                    name: 'history',
                    resource_type: 'snapshot',
                    access: 'public',
                    depends_on_nodes: ['seed.resources.lookup'],
                }),
            ]),
        );
        const consumer = await createTask(
            'resource_consumer',
            {
                report: "select a.id from {{ ref('resources', 'lookup') }} a join {{ ref('resources', 'history') }} b on a.id = b.id",
            },
            'version: 2\nmodels:\n  - name: report\n',
        );
        const result = await resolveCrossSourceManifests({
            tasks: [consumer, provider],
            enabled: true,
            concurrency: 2,
            cache: [
                {
                    key: provider.key,
                    projectName: provider.key,
                    nodes,
                    referencedProjects: [],
                },
            ],
        });
        expect(
            dependencies(
                result.results[0].result.manifest,
                'model.resource_consumer.report',
            ),
        ).toEqual(['seed.resources.lookup', 'snapshot.resources.history']);
        expect(
            result.results[0].result.manifest.nodes['seed.resources.lookup'],
        ).toBeUndefined();
        expect(
            result.results[0].result.manifest.nodes[
                'snapshot.resources.history'
            ],
        ).toBeUndefined();
    }, 120000);

    it('ignores the store and keeps ordinary dbt failure with the flag off', async () => {
        const warn = vi.spyOn(Logger, 'warn');
        try {
            expect(
                await dbtFailure(
                    resolveCrossSourceManifests({
                        tasks: await ring(),
                        enabled: false,
                        concurrency: 2,
                        cache,
                    }),
                ),
            ).toMatch(/which was not found/);
            expect(JSON.stringify(warn.mock.calls)).not.toContain('Cold start');
        } finally {
            warn.mockRestore();
        }
    }, 120000);
});
