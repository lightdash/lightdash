import {
    combineManifestSources,
    DbtError,
    isExternalDbtNode,
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
const cycleError =
    'Cannot resolve cross-source dbt refs: the pending sources depend on each other. Source "cycle_a": cycle_b.model_b; Source "cycle_b": cycle_a.model_a';
const missingUpstreamError =
    'Cannot resolve dbt source "missing_upstream": ref "nowhere.ghost" was not found. No connected dbt source provides project "nowhere".';

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
                scan = false,
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

            it('orders a scanned chain with one dbt ls per source', async () => {
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
                expect(resolution.attempts).toBeGreaterThan(3);
                for (const name of ['m_var', 'm_set', 'm_macro'])
                    expect(
                        resolution.results[0].result.manifest.nodes[
                            `model.dyn_downstream.${name}`
                        ],
                    ).toBeDefined();
            }, 120_000);

            it('resolves two sources in two rounds and strips stubs while keeping dependencies', async () => {
                const resolution = await resolve([
                    'shared_dimensions',
                    'analytics',
                ]);
                expect(resolution.rounds).toBe(2);
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

            it('resolves a reversed chain in three rounds and records both upstream sources', async () => {
                const resolution = await resolve([
                    'chain_c',
                    'analytics',
                    'shared_dimensions',
                ]);
                expect(resolution.rounds).toBe(3);
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

            it('resolves the diamond in three rounds once both sides are ready', async () => {
                const resolution = await resolve([
                    'shared_dimensions',
                    'diamond_left',
                    'diamond_right',
                    'diamond_top',
                ]);
                expect(resolution.rounds).toBe(3);
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

            it('reports both sources and refs in a cycle', async () => {
                await expect(
                    resolve(['cycle_a', 'cycle_b']),
                ).rejects.toHaveProperty('message', cycleError);
            }, 120_000);

            it.each([
                { projects: ['missing_upstream'] },
                { projects: ['missing_upstream', 'shared_dimensions'] },
            ])(
                'reports a missing upstream with sources $projects',
                async ({ projects }) => {
                    await expect(resolve(projects)).rejects.toHaveProperty(
                        'message',
                        missingUpstreamError,
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
                expect(resolution.rounds).toBe(2);
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
                    expect(resolution.rounds).toBe(2);
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

            it('rejects a ref to a private upstream model', async () => {
                const tasks = await Promise.all([
                    task('access_upstream'),
                    task('access_downstream', 'uses_private'),
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
                    'not allowed because the referenced node is private',
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
