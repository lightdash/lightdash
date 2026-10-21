import {
    combineManifestSources,
    DbtError,
    getExternalModelNodesFromManifest,
    isExternalDbtNode,
    ParameterError,
    SupportedDbtVersions,
    type DbtRawModelNode,
} from '@lightdash/common';
import execa from 'execa';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { scanDbtProject } from '../dbt/dbtProjectScan';
import {
    resolveCrossSourceManifests,
    type CrossSourceFetchTask,
    type CrossSourceResolution,
} from './crossSourceRefs';

const executables = process.env.LIGHTDASH_TEST_DBT_EXECUTABLES;
const matrix = executables
    ? executables.split(',').map((entry) => {
          const separator = entry.indexOf('=');
          const version = entry.slice(0, separator).trim();
          const executable = entry.slice(separator + 1).trim();
          const dbtVersion = Object.values(SupportedDbtVersions).find(
              (supported) => supported === `v${version}`,
          );
          if (separator < 1 || !executable || !dbtVersion) {
              throw new Error(
                  'LIGHTDASH_TEST_DBT_EXECUTABLES must contain supported version=path pairs',
              );
          }
          return { version, executable: path.resolve(executable), dbtVersion };
      })
    : [];

const fixtures = path.resolve(
    __dirname,
    '../../../../examples/cross-source-dbt-refs',
);
const dbtErrorOutput = async (
    resolution: Promise<unknown>,
): Promise<string> => {
    try {
        await resolution;
    } catch (error) {
        expect(error).toBeInstanceOf(DbtError);
        if (error instanceof DbtError) {
            return [
                error.message,
                ...(error.logs ?? []).map((log) => log.info.msg),
            ].join('\n');
        }
        throw error;
    }
    throw new Error('Expected dbt to reject the cross-source refs');
};

describe.skipIf(!executables)('cross-source refs with real dbt', () => {
    describe.each(matrix)(
        'dbt $version',
        ({ version, executable, dbtVersion }) => {
            let directory: string;
            let originalPath: string | undefined;
            const clients: DbtCliClient[] = [];
            let accessResolution: Promise<
                CrossSourceResolution<string>
            > | null = null;

            beforeAll(async () => {
                originalPath = process.env.PATH;
                directory = await fs.mkdtemp(
                    path.join(os.tmpdir(), 'cross-source-dbt-refs-'),
                );
                const bin = path.join(directory, 'bin');
                await fs.mkdir(bin);
                await fs.access(executable, fs.constants.X_OK);
                await fs.symlink(executable, path.join(bin, `dbt${version}`));
                process.env.PATH = `${bin}${path.delimiter}${originalPath ?? ''}`;
            });

            afterAll(async () => {
                if (originalPath === undefined) {
                    delete process.env.PATH;
                } else {
                    process.env.PATH = originalPath;
                }
                try {
                    await Promise.all(
                        clients.map((client) => client.cleanup()),
                    );
                } finally {
                    if (directory)
                        await fs.rm(directory, {
                            recursive: true,
                            force: true,
                        });
                }
            });

            const task = async (
                project: string,
                enabledModel: string | null = null,
                restrictAccess = false,
                scan = true,
                dynamicOnly = false,
            ): Promise<CrossSourceFetchTask<string>> => {
                const copy = await fs.mkdtemp(
                    path.join(directory, `${project}-`),
                );
                await fs.cp(path.join(fixtures, project), copy, {
                    recursive: true,
                    filter: (source) =>
                        !['target', 'logs', 'dbt_packages'].includes(
                            path.basename(source),
                        ),
                });
                if (dynamicOnly) {
                    await Promise.all(
                        (await fs.readdir(path.join(copy, 'models')))
                            .filter(
                                (entry) =>
                                    ![
                                        'm_var.sql',
                                        'm_set.sql',
                                        'm_macro.sql',
                                    ].includes(entry),
                            )
                            .map((entry) =>
                                fs.rm(path.join(copy, 'models', entry)),
                            ),
                    );
                }
                if (restrictAccess) {
                    await fs.appendFile(
                        path.join(copy, 'dbt_project.yml'),
                        '\nrestrict-access: true\n',
                    );
                }
                if (enabledModel !== null) {
                    const modelPath = path.join(
                        copy,
                        'models',
                        `${enabledModel}.sql`,
                    );
                    const sql = await fs.readFile(modelPath, 'utf8');
                    expect(sql).toContain('config(enabled=false)');
                    await fs.writeFile(
                        modelPath,
                        sql.replace(
                            'config(enabled=false)',
                            'config(enabled=true)',
                        ),
                    );
                    await Promise.all(
                        [
                            'uses_versioned',
                            'uses_versioned_latest',
                            'uses_versioned_v1',
                        ].map(async (name) => {
                            const versionedPath = path.join(
                                copy,
                                'models',
                                `${name}.sql`,
                            );
                            const versionedSql = await fs.readFile(
                                versionedPath,
                                'utf8',
                            );
                            await fs.writeFile(
                                versionedPath,
                                `{{ config(enabled=false) }}\n${versionedSql}`,
                            );
                        }),
                    );
                }
                const client = new DbtCliClient({
                    dbtProjectDirectory: copy,
                    dbtProfilesDirectory: path.join(fixtures, 'profiles'),
                    environment: {
                        PGHOST: process.env.PGHOST ?? '127.0.0.1',
                        PGPORT: process.env.PGPORT ?? '15432',
                        PGUSER: process.env.PGUSER ?? 'postgres',
                        PGPASSWORD: process.env.PGPASSWORD ?? 'password',
                        PGDATABASE: process.env.PGDATABASE ?? 'postgres',
                        SEED_SCHEMA: `${process.env.SEED_SCHEMA ?? 'cross_source_refs'}_${project}`,
                    },
                    environmentVariableAllowlist: [],
                    explicitCredentials: true,
                    dbtVersion,
                    partialParseBaselinePath: null,
                });
                clients.push(client);
                return {
                    prepare: scan
                        ? async (options) => {
                              await client.installDeps(options?.signal);
                              return scanDbtProject(copy);
                          }
                        : undefined,
                    key: project,
                    context: project,
                    fetch: async (options) => {
                        const started = Date.now();
                        const result = await client.getDbtManifest(options);
                        return {
                            ...result,
                            timings: {
                                gitRefreshMs: null,
                                depsMs: null,
                                manifestMs: Date.now() - started,
                            },
                        };
                    },
                };
            };

            const resolve = async (projects: string[], enabled = true) =>
                resolveCrossSourceManifests({
                    tasks: await Promise.all(
                        projects.map((project) => task(project)),
                    ),
                    enabled,
                    concurrency: 1,
                });

            const access = () => {
                accessResolution ??= resolve([
                    'access_upstream',
                    'access_downstream',
                ]);
                return accessResolution;
            };

            it('cancels a slow dbt ls without leaving a dbt process', async () => {
                const source = await task('shared_dimensions');
                const client = clients[clients.length - 1];
                await fs.writeFile(
                    path.join(
                        client.dbtProjectDirectory,
                        'models',
                        'leaf_slow.sql',
                    ),
                    `{% for j in range(100000) %}{% for i in range(100000) %}{% set x = i * j %}{% endfor %}{% endfor %} select 1`,
                );
                await expect(
                    resolveCrossSourceManifests({
                        tasks: [source],
                        enabled: true,
                        concurrency: 1,
                        timeouts: {
                            prepareMs: 30000,
                            lsMs: 2000,
                            resolutionMs: 60000,
                        },
                    }),
                ).rejects.toThrow('timed out after 2 s while running dbt ls.');
                const processes = await execa('ps', ['-eo', 'pid,args']);
                expect(
                    processes.stdout
                        .split('\n')
                        .filter(
                            (line) =>
                                line.includes('--project-dir') &&
                                line.includes(client.dbtProjectDirectory),
                        ),
                ).toEqual([]);
            }, 30000);

            it('resolves a scanned chain with one dbt ls per source', async () => {
                const resolution = await resolveCrossSourceManifests({
                    tasks: await Promise.all(
                        ['chain_c', 'analytics', 'shared_dimensions'].map(
                            (name) => task(name, null, false, true),
                        ),
                    ),
                    enabled: true,
                    concurrency: 1,
                });
                expect(resolution.attempts).toBe(3);
                expect(resolution.firstAttemptInjected).toBe(2);
                expect(resolution.passes).toBe(1);
                expect(resolution.results[0].injectedFrom.sort()).toEqual([
                    'analytics',
                    'shared_dimensions',
                ]);
            }, 120_000);

            it('resolves dynamic var, macro and set refs missed by the scan with a retry', async () => {
                const resolution = await resolveCrossSourceManifests({
                    tasks: [
                        await task('dyn_downstream', null, false, true, true),
                        await task('dyn_upstream', null, false, true),
                        await task('dyn_upstream2', null, false, true),
                    ],
                    enabled: true,
                    concurrency: 1,
                });
                expect(resolution.passes).toBe(2);
                expect(resolution.attempts).toBe(4);
                for (const name of ['m_var', 'm_set', 'm_macro'])
                    expect(
                        resolution.results[0].result.manifest.nodes[
                            `model.dyn_downstream.${name}`
                        ],
                    ).toBeDefined();
            }, 120_000);

            it('resolves two sources in one pass and strips stubs while keeping dependencies', async () => {
                const resolution = await resolve([
                    'shared_dimensions',
                    'analytics',
                ]);
                expect(resolution.passes).toBe(1);
                const { manifest } = resolution.results[1].result;
                expect(
                    Object.values(manifest.nodes).filter((node) =>
                        isExternalDbtNode(node as DbtRawModelNode),
                    ),
                ).toEqual([]);
                expect(
                    manifest.nodes['model.analytics.fct_orders'],
                ).toMatchObject({
                    depends_on: {
                        nodes: ['model.shared_dimensions.dim_calendar'],
                    },
                });
                expect(
                    manifest.nodes['model.shared_dimensions.dim_calendar'],
                ).toBeUndefined();
            }, 120_000);

            it('resolves a reversed chain in one pass', async () => {
                const resolution = await resolve([
                    'chain_c',
                    'analytics',
                    'shared_dimensions',
                ]);
                expect(resolution.passes).toBe(1);
                expect(resolution.results[0].injectedFrom.sort()).toEqual([
                    'analytics',
                    'shared_dimensions',
                ]);
                expect(
                    resolution.results[0].result.manifest.nodes[
                        'model.chain_c.agg_orders_by_year'
                    ],
                ).toBeDefined();
            }, 120_000);

            it('resolves the diamond in one pass', async () => {
                const resolution = await resolve([
                    'shared_dimensions',
                    'diamond_left',
                    'diamond_right',
                    'diamond_top',
                ]);
                expect(resolution.passes).toBe(1);
                expect(
                    resolution.results[3].result.manifest.nodes[
                        'model.diamond_top.joined_days'
                    ],
                ).toMatchObject({
                    depends_on: {
                        nodes: [
                            'model.diamond_left.left_days',
                            'model.diamond_right.right_days',
                        ],
                    },
                });
            }, 120_000);

            it.each([
                ['cycle_a', 'cycle_b'],
                ['ring_a', 'ring_b', 'ring_c'],
            ])(
                'allows project cycles %j in one pass',
                async (...projects) => {
                    const resolution = await resolve(projects);
                    expect(resolution.passes).toBe(1);
                    expect(resolution.attempts).toBe(projects.length);
                },
                120_000,
            );

            it('rejects a real node cycle with an ordered path', async () => {
                await expect(
                    resolve(['node_cycle_a', 'node_cycle_b']),
                ).rejects.toThrow(
                    'model.node_cycle_a.model_a -> model.node_cycle_b.model_b -> model.node_cycle_a.model_a',
                );
            }, 120_000);

            it.each([
                { projects: ['missing_upstream'] },
                { projects: ['missing_upstream', 'shared_dimensions'] },
            ])(
                'reports a missing provider with sources $projects',
                async ({ projects }) => {
                    await expect(resolve(projects)).rejects.toThrow(
                        'no connected dbt source provides project "nowhere"',
                    );
                },
                120_000,
            );

            it('keeps the original dbt error when resolution is disabled', async () => {
                expect(
                    await dbtErrorOutput(
                        resolve(['shared_dimensions', 'analytics'], false),
                    ),
                ).toContain('which was not found');
            }, 120_000);

            it('keeps same-named local models and records the manifest merge collision behaviour', async () => {
                const resolution = await resolve([
                    'same_name_a',
                    'same_name_b',
                ]);
                resolution.results.forEach(({ result }, index) => {
                    const project = index === 0 ? 'same_name_a' : 'same_name_b';
                    expect(
                        result.manifest.nodes[`model.${project}.customers`],
                    ).toMatchObject({
                        unique_id: `model.${project}.customers`,
                        package_name: project,
                    });
                });
                expect(
                    resolution.results[0].result.manifest.nodes[
                        'model.same_name_a.customers'
                    ],
                ).toHaveProperty('columns.customer_name');
                expect(
                    resolution.results[1].result.manifest.nodes[
                        'model.same_name_b.customers'
                    ],
                ).toHaveProperty('columns.is_downstream');
                const combined = combineManifestSources(
                    resolution.results.map(
                        ({ task: source, result }, precedence) => ({
                            name: source.key,
                            precedence,
                            manifest: result.manifest,
                        }),
                    ),
                );
                process.stdout.write(
                    `cross-source refs dbt ${version} same-name collisions: ${JSON.stringify(combined.collisions)}\n`,
                );
                expect(
                    combined.manifest.nodes['model.same_name_a.customers'],
                ).toBeDefined();
                expect(
                    combined.manifest.nodes['model.same_name_b.customers'],
                ).toBeDefined();
            }, 120_000);

            it('resolves public and versioned refs with restricted models disabled', async () => {
                const resolution = await access();
                expect(resolution.passes).toBe(1);
                const { manifest } = resolution.results[1].result;
                expect(Object.keys(manifest.nodes).sort()).toEqual([
                    'model.access_downstream.uses_public',
                    'model.access_downstream.uses_versioned',
                    'model.access_downstream.uses_versioned_latest',
                    'model.access_downstream.uses_versioned_v1',
                ]);
            }, 120_000);

            it.each([false, true])(
                'resolves a protected cross-project ref through injected nodes with consumer restrict-access=%s',
                async (restrictAccess) => {
                    const resolution = await resolveCrossSourceManifests({
                        tasks: await Promise.all([
                            task('access_upstream'),
                            task(
                                'access_downstream',
                                'uses_protected',
                                restrictAccess,
                            ),
                        ]),
                        enabled: true,
                        concurrency: 1,
                    });
                    expect(resolution.passes).toBe(2);
                    expect(
                        resolution.results[1].result.manifest.nodes[
                            'model.access_downstream.uses_protected'
                        ],
                    ).toMatchObject({
                        depends_on: {
                            nodes: ['model.access_upstream.protected_model'],
                        },
                    });
                },
                120_000,
            );

            it.skip(`rejects a protected upstream ref (unsupported in dbt ${version}: protected access is not enforced for injected external nodes)`, async () => {
                const tasks = await Promise.all([
                    task('access_upstream'),
                    task('access_downstream', 'uses_protected', true),
                ]);
                expect(
                    await dbtErrorOutput(
                        resolveCrossSourceManifests({
                            tasks,
                            enabled: true,
                            concurrency: 1,
                        }),
                    ),
                ).toContain(
                    'not allowed because the referenced node is protected',
                );
            }, 120_000);

            it('rejects a private ref through placeholders before another dbt ls', async () => {
                const tasks = await Promise.all([
                    task('access_downstream', 'uses_private'),
                    task('access_upstream'),
                ]);
                await expect(
                    resolveCrossSourceManifests({
                        tasks,
                        enabled: true,
                        concurrency: 2,
                    }),
                ).rejects.toThrow('defines that model as private');
            }, 120_000);

            it('uses a cached catalogue in a single pass for dynamic refs', async () => {
                const tasks = [
                    await task('dyn_downstream', null, false, true, true),
                    await task('dyn_upstream'),
                    await task('dyn_upstream2'),
                ];
                const referenced = new Map<string, string[]>();
                const first = await resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    onSourceResolved: async ({
                        task: source,
                        referencedProjects,
                    }) => {
                        referenced.set(source.key, referencedProjects);
                    },
                });
                expect(first.passes).toBe(2);
                const cache = first.results.map(({ task: source, result }) => ({
                    key: source.key,
                    referencedProjects: referenced.get(source.key) ?? [],
                    projectName: result.manifest.metadata.project_name!,
                    nodes: getExternalModelNodesFromManifest(result.manifest),
                }));
                const second = await resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    cache,
                });
                expect(second.passes).toBe(1);
                expect(referenced.get('dyn_downstream')).toEqual([
                    'dyn_upstream',
                ]);
                const providerNodes = cache.find(
                    (row) => row.key === 'dyn_upstream',
                )!.nodes.length;
                expect(providerNodes).toBeGreaterThan(0);
                expect(second.stubs!.cached).toBe(providerNodes);
                expect(
                    second.sources?.map(({ key, injectedStubs }) => ({
                        key,
                        injectedStubs,
                    })),
                ).toEqual([
                    { key: 'dyn_downstream', injectedStubs: providerNodes },
                    { key: 'dyn_upstream', injectedStubs: 0 },
                    { key: 'dyn_upstream2', injectedStubs: 0 },
                ]);
                expect(second.contradictions).toBe(0);
            }, 120_000);

            it.each([false, true])(
                'binds versioned refs with cached=%s',
                async (cached) => {
                    const tasks = [
                        await task('access_downstream'),
                        await task('access_upstream'),
                    ];
                    const first = await resolveCrossSourceManifests({
                        tasks,
                        enabled: true,
                        concurrency: 2,
                    });
                    const cache = cached
                        ? first.results.map(({ task: source, result }) => ({
                              key: source.key,
                              referencedProjects: [],
                              projectName:
                                  result.manifest.metadata.project_name!,
                              nodes: getExternalModelNodesFromManifest(
                                  result.manifest,
                              ),
                          }))
                        : [];
                    const resolution = await resolveCrossSourceManifests({
                        tasks,
                        enabled: true,
                        concurrency: 2,
                        cache,
                    });
                    expect(resolution.passes).toBe(1);
                    expect(
                        (
                            resolution.results[0].result.manifest.nodes[
                                'model.access_downstream.uses_versioned_v1'
                            ] as DbtRawModelNode
                        ).depends_on?.nodes,
                    ).toEqual(['model.access_upstream.dim_product.v1']);
                    expect(
                        (
                            resolution.results[0].result.manifest.nodes[
                                'model.access_downstream.uses_versioned_latest'
                            ] as DbtRawModelNode
                        ).depends_on?.nodes,
                    ).toEqual(['model.access_upstream.dim_product.v2']);
                },
                120_000,
            );

            it.each([false, true])(
                'resolves a versioned project cycle with cached=%s',
                async (cached) => {
                    const tasks = await Promise.all(
                        ['versioned_ring_a', 'versioned_ring_b'].map((name) =>
                            task(name),
                        ),
                    );
                    const first = await resolveCrossSourceManifests({
                        tasks,
                        enabled: true,
                        concurrency: 2,
                    });
                    const cache = cached
                        ? first.results.map(({ task: source, result }) => ({
                              key: source.key,
                              projectName:
                                  result.manifest.metadata.project_name!,
                              referencedProjects: [],
                              nodes: getExternalModelNodesFromManifest(
                                  result.manifest,
                              ),
                          }))
                        : [];
                    const resolution = cached
                        ? await resolveCrossSourceManifests({
                              tasks,
                              enabled: true,
                              concurrency: 2,
                              cache,
                          })
                        : first;
                    expect(resolution.passes).toBe(1);
                    const { manifest } = resolution.results[0].result;
                    for (const [name, modelVersion] of [
                        ['uses_v3', 3],
                        ['uses_latest', 3],
                        ['uses_v1', 1],
                    ])
                        expect(
                            (
                                manifest.nodes[
                                    `model.versioned_ring_a.${name}`
                                ] as DbtRawModelNode
                            ).depends_on?.nodes,
                        ).toEqual([
                            `model.versioned_ring_b.dim.v${modelVersion}`,
                        ]);
                    expect(
                        (
                            resolution.results[1].result.manifest.nodes[
                                'model.versioned_ring_b.uses_a'
                            ] as DbtRawModelNode
                        ).depends_on?.nodes,
                    ).toEqual(['model.versioned_ring_a.base']);
                },
                120_000,
            );

            it('resolves a cached non-leaf provider through a one-argument ref', async () => {
                const tasks = [
                    await task('versioned_ring_a'),
                    await task('versioned_ring_b'),
                ];
                const first = await resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                });
                const cache = first.results.map(({ task: source, result }) => ({
                    key: source.key,
                    projectName: result.manifest.metadata.project_name!,
                    referencedProjects: [],
                    nodes: getExternalModelNodesFromManifest(result.manifest),
                }));
                const consumerClient = clients[clients.length - 2];
                await Promise.all(
                    ['uses_v3', 'uses_latest', 'uses_v1'].map(async (name) => {
                        const filename = path.join(
                            consumerClient.dbtProjectDirectory,
                            'models',
                            `${name}.sql`,
                        );
                        await fs.writeFile(
                            filename,
                            (await fs.readFile(filename, 'utf8')).replace(
                                "'versioned_ring_b', ",
                                '',
                            ),
                        );
                    }),
                );
                const provider = cache.find(
                    (row) => row.key === 'versioned_ring_b',
                )!;
                const versions = provider.nodes.filter(
                    (node) => node.name === 'dim',
                );
                expect(versions).toHaveLength(2);
                expect(
                    versions.every((node) =>
                        node.depends_on_nodes.includes(
                            'model.versioned_ring_b.base',
                        ),
                    ),
                ).toBe(true);
                const resolution = await resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    cache,
                });
                expect(resolution.passes).toBe(1);
                expect(
                    (
                        resolution.results[0].result.manifest.nodes[
                            'model.versioned_ring_a.uses_v3'
                        ] as DbtRawModelNode
                    ).depends_on?.nodes,
                ).toEqual(['model.versioned_ring_b.dim.v3']);
            }, 120_000);

            it('names the consumer, provider and missing numeric version', async () => {
                const consumer = await task('versioned_ring_a');
                await fs.writeFile(
                    path.join(
                        clients[clients.length - 1].dbtProjectDirectory,
                        'models',
                        'uses_missing.sql',
                    ),
                    "select * from {{ ref('versioned_ring_b', 'dim', v=4) }}\n",
                );
                const provider = await task('versioned_ring_b');
                const resolution = resolveCrossSourceManifests({
                    tasks: [consumer, provider],
                    enabled: true,
                    concurrency: 2,
                });
                await expect(resolution).rejects.toBeInstanceOf(ParameterError);
                await expect(resolution).rejects.toThrow(
                    `Model "uses_missing" in dbt source "versioned_ring_a" references ref('versioned_ring_b', 'dim', v=4), but dbt source "versioned_ring_b" does not define that model (or version).`,
                );
            }, 120_000);

            it('allows a public provider after an older cache marked it private', async () => {
                const tasks = await Promise.all(
                    ['access_downstream', 'access_upstream'].map((name) =>
                        task(name),
                    ),
                );
                const first = await resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                });
                const cache = first.results.map(({ task: source, result }) => ({
                    key: source.key,
                    projectName: result.manifest.metadata.project_name!,
                    referencedProjects: [],
                    nodes: getExternalModelNodesFromManifest(
                        result.manifest,
                    ).map((node) =>
                        node.name === 'public_model'
                            ? { ...node, access: 'private' as const }
                            : node,
                    ),
                }));
                const resolution = await resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    cache,
                });
                expect(resolution.passes).toBe(1);
                expect(
                    (
                        resolution.results[0].result.manifest.nodes[
                            'model.access_downstream.uses_public'
                        ] as DbtRawModelNode
                    ).depends_on?.nodes,
                ).toEqual(['model.access_upstream.public_model']);
            }, 120_000);

            it('source failure isolation keeps real dbt work after a Git clone failure', async () => {
                const healthy = await task('access_upstream');
                const fetch = vi.fn(async () => {
                    throw new Error('The failed source must not be fetched');
                });
                const broken: CrossSourceFetchTask<string> = {
                    key: 'unavailable',
                    context: 'unavailable',
                    fetch,
                    prepare: async () => {
                        await execa('git', [
                            'clone',
                            '--no-local',
                            path.join(directory, 'missing-repository'),
                            path.join(directory, 'clone-target'),
                        ]);
                        return null;
                    },
                };
                const skipped = vi.fn(
                    async (source: CrossSourceFetchTask<string>) =>
                        source.key !== healthy.key,
                );
                const resolution = await resolveCrossSourceManifests({
                    tasks: [healthy, broken],
                    enabled: true,
                    concurrency: 1,
                    onSourceFailure: skipped,
                });
                expect(
                    resolution.results.map((entry) => entry.task.key),
                ).toEqual(['access_upstream']);
                expect(skipped).toHaveBeenCalledWith(
                    broken,
                    expect.any(Error),
                    'prepare',
                );
                expect(fetch).not.toHaveBeenCalled();
            }, 120_000);

            it('source failure isolation keeps a healthy real dbt source after a parse failure', async () => {
                const healthy = await task('access_upstream');
                const broken = await task('shared_dimensions');
                const brokenClient = clients[clients.length - 1];
                await fs.writeFile(
                    path.join(
                        brokenClient.dbtProjectDirectory,
                        'models',
                        'broken.sql',
                    ),
                    '{% if %}',
                );
                const skipped = vi.fn(
                    async (source: CrossSourceFetchTask<string>) =>
                        source.key !== healthy.key,
                );
                const resolution = await resolveCrossSourceManifests({
                    tasks: [healthy, broken],
                    enabled: true,
                    concurrency: 1,
                    onSourceFailure: skipped,
                });
                expect(
                    resolution.results.map((entry) => entry.task.key),
                ).toEqual(['access_upstream']);
                expect(skipped).toHaveBeenCalledWith(
                    broken,
                    expect.any(DbtError),
                    'manifest',
                );
            }, 120_000);

            it('source failure isolation drops real dbt consumers of a failed provider despite cached nodes', async () => {
                const consumer = await task('analytics');
                const provider = await task('shared_dimensions');
                const healthy = await task('access_upstream');
                const first = await resolveCrossSourceManifests({
                    tasks: [consumer, provider],
                    enabled: true,
                    concurrency: 1,
                });
                const cache = first.results.map(({ task: source, result }) => ({
                    key: source.key,
                    referencedProjects: [],
                    projectName: result.manifest.metadata.project_name!,
                    nodes: getExternalModelNodesFromManifest(result.manifest),
                }));
                const providerClient = clients[clients.length - 2];
                await fs.writeFile(
                    path.join(
                        providerClient.dbtProjectDirectory,
                        'models',
                        'broken.sql',
                    ),
                    '{% if %}',
                );
                const skipped = vi.fn(
                    async (source: CrossSourceFetchTask<string>) =>
                        source.key !== healthy.key,
                );
                const resolution = await resolveCrossSourceManifests({
                    tasks: [healthy, consumer, provider],
                    cache,
                    enabled: true,
                    concurrency: 1,
                    onSourceFailure: skipped,
                });
                expect(
                    resolution.results.map((entry) => entry.task.key),
                ).toEqual(['access_upstream']);
                expect(skipped).toHaveBeenCalledWith(
                    consumer,
                    expect.objectContaining({
                        name: 'DbtSourceDependencyError',
                    }),
                    'dependency',
                );
            }, 120_000);

            it('rejects a cached model deleted from the provider fixture', async () => {
                const tasks = [
                    await task('analytics'),
                    await task('shared_dimensions'),
                ];
                const first = await resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                });
                const cache = first.results.map(({ task: source, result }) => ({
                    key: source.key,
                    referencedProjects: [],
                    projectName: result.manifest.metadata.project_name!,
                    nodes: getExternalModelNodesFromManifest(result.manifest),
                }));
                const providerClient = clients[clients.length - 1];
                await fs.rm(
                    path.join(
                        providerClient.dbtProjectDirectory,
                        'models',
                        'dim_calendar.sql',
                    ),
                );
                const resolution = resolveCrossSourceManifests({
                    tasks,
                    enabled: true,
                    concurrency: 2,
                    cache,
                });
                await expect(resolution).rejects.toBeInstanceOf(ParameterError);
                await expect(resolution).rejects.toThrow('fct_orders');
                await expect(resolution).rejects.toThrow('shared_dimensions');
                await expect(resolution).rejects.toThrow(
                    'does not define that model (or version)',
                );
            }, 120_000);

            it('keeps the explicit version dependency on dim_product v1', async () => {
                const resolution = await access();
                expect(
                    resolution.results[1].result.manifest.nodes[
                        'model.access_downstream.uses_versioned_v1'
                    ],
                ).toMatchObject({
                    depends_on: {
                        nodes: ['model.access_upstream.dim_product.v1'],
                    },
                });
            }, 120_000);

            it('keeps the explicit and latest version dependency on dim_product v2', async () => {
                const resolution = await access();
                ['uses_versioned', 'uses_versioned_latest'].forEach((name) => {
                    expect(
                        resolution.results[1].result.manifest.nodes[
                            `model.access_downstream.${name}`
                        ],
                    ).toMatchObject({
                        depends_on: {
                            nodes: ['model.access_upstream.dim_product.v2'],
                        },
                    });
                });
            }, 120_000);
        },
    );
});
