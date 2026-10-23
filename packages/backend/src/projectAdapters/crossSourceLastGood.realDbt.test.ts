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
                'version: 2\nmodels:\n  - name: alpha_base\n    access: protected\n  - name: alpha_report\n    access: protected\n',
            ),
            createTask(
                'proj_beta',
                {
                    measure_v2: 'select 2 as id',
                    measure_v3: 'select 3 as id',
                    beta_report:
                        "select * from {{ ref('proj_alpha', 'alpha_base') }}",
                },
                'version: 2\nmodels:\n  - name: measure\n    access: protected\n    latest_version: 2\n    versions:\n      - v: 2\n      - v: 3\n  - name: beta_report\n    access: protected\n',
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
                'version: 2\nmodels:\n  - name: alpha_base\n    access: protected\n',
            ),
            createTask(
                'proj_beta',
                { measure_v3: 'select 3 as id' },
                'version: 2\nmodels:\n  - name: measure\n    access: protected\n    latest_version: 3\n    versions:\n      - v: 3\n',
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
                .every((node) => node.access === 'protected'),
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

    it('preserves dbt access checks for private stored models', async () => {
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
                    nodes: entry.nodes.map((node) => ({
                        ...node,
                        access:
                            node.name === 'measure' ? 'private' : node.access,
                    })),
                })),
            }),
        ).rejects.toThrow();
        expect(
            errors
                .flatMap((error) =>
                    (error.logs ?? []).map((log) => log.info.msg),
                )
                .join('\n'),
        ).toMatch(/referenced node is private/);
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
