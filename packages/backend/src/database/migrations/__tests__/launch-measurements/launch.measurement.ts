import { RequestMethod } from '@lightdash/common';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { fromSession } from '../../../../auth/account/account';
import { lightdashConfig } from '../../../../config/lightdashConfig';
import { agentExecutionContext } from '../../../../services/AiAccessService/agentExecutionContext';
import { ProjectService } from '../../../../services/ProjectService/ProjectService';
import { createMigratedDatabase } from '../../../../testing/migratedDatabase';
import { capabilities, explore, fixture } from './fixture.mock';
import {
    byteSize,
    measure as capture,
    repeat as repeatedCapture,
    stats,
    summarize,
    type Measurement,
    type Sample,
} from './metrics';
import { projectHooks } from './projectHooks';
import { renderReport } from './report';

vi.mock('../../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock: config } =
        await import('../../../../config/lightdashConfig.mock');
    return {
        lightdashConfig: {
            ...config,
            lightdashSecret: process.env.LIGHTDASH_SECRET!,
            lightdashSecrets: {
                active: process.env.LIGHTDASH_SECRET!,
                fallbacks: [],
                all: [process.env.LIGHTDASH_SECRET!],
            },
            siteUrl: 'https://instance.example',
            auth: {
                ...config.auth,
                pat: { ...config.auth.pat, enabled: true },
                oauthServer: {
                    accessTokenLifetime: 3600,
                    refreshTokenLifetime: 86400,
                    mobileRefreshTokenLifetime: 86400,
                    refreshTokenRotationGrace: 0,
                },
            },
        },
    };
});

const sizes = (name: string, fallback: string) =>
    (process.env[name] ?? fallback)
        .split(',')
        .map(Number)
        .sort((a, b) => a - b);
const output = process.env.MEASUREMENT_JSON!;
const requestPath = '/api/v2/user/agent-connections/requests';
export type Results = {
    environment: Record<string, unknown>;
    A: {
        projects: number;
        grantProjects: number | null;
        credential: string;
        measurement: Measurement;
    }[];
    B: {
        projects: number;
        grantBytes: Record<string, number>;
        pendingBytes: Record<string, number> | null;
        approval: Record<string, Measurement>;
        status: Measurement;
        list: { connections: number; measurement: Measurement }[];
        aboveLimit: string | null;
    }[];
    C: {
        explores: number;
        sourceJsonBytes: number;
        databaseTextBytes: number;
        load: Measurement;
        heapGrowth: ReturnType<typeof stats>;
        operations: {
            name: string;
            calls: number;
            measurement: Measurement;
            completed: boolean;
        }[];
    }[];
    overLimit: {
        projects: number;
        grantError: string;
        approvalError: string;
        grant: Measurement;
        approval: Measurement;
    }[];
    D: MemoryResult[];
};
type MemoryResult = {
    mode: string;
    explores: number;
    sourceBytes: number;
    baselineHeap: number;
    peakHeap: number;
    heapDelta: number;
    baselineRss: number;
    peakRss: number;
    rssDelta: number;
    retainedHeapDelta: number;
    durationMs: number;
    produced: number;
    consumed: number;
    producedBeforeFirstConsume: number;
    load: number[];
};

const memoryRun = async (): Promise<MemoryResult> => {
    const count = Number(process.env.MEASURE_MEMORY_SIZE);
    const mode = process.env.MEASURE_MEMORY!;
    const service: ProjectService = Object.assign(
        Object.create(ProjectService.prototype),
        { assertConnectionPreAggregateRefresh: async () => {} },
    );
    let produced = 0;
    let consumed = 0;
    let producedBeforeFirstConsume = 0;
    let sourceBytes = 0;
    global.gc!();
    const baseline = process.memoryUsage();
    let peakHeap = baseline.heapUsed;
    let peakRss = baseline.rss;
    const sample = () => {
        const usage = process.memoryUsage();
        peakHeap = Math.max(peakHeap, usage.heapUsed);
        peakRss = Math.max(peakRss, usage.rss);
    };
    async function* incoming() {
        for (let i = 0; i < count; i += 1) {
            const item = explore(i);
            sourceBytes += byteSize(item);
            produced += 1;
            sample();
            yield item;
        }
    }
    const start = performance.now();
    const stream =
        mode === 'buffered'
            ? await projectHooks(service).prepareConnectionExploreStream(
                  'memory-only',
                  incoming(),
              )
            : incoming();
    global.gc!();
    const retainedHeapDelta =
        process.memoryUsage().heapUsed - baseline.heapUsed;
    sample();
    for await (const item of stream) {
        if (consumed === 0) producedBeforeFirstConsume = produced;
        assert(item.name);
        consumed += 1;
        sample();
    }
    assert.equal(consumed, count);
    assert.equal(producedBeforeFirstConsume, mode === 'buffered' ? count : 1);
    return {
        mode,
        explores: count,
        sourceBytes,
        baselineHeap: baseline.heapUsed,
        peakHeap,
        heapDelta: peakHeap - baseline.heapUsed,
        baselineRss: baseline.rss,
        peakRss,
        rssDelta: peakRss - baseline.rss,
        retainedHeapDelta,
        durationMs: performance.now() - start,
        produced,
        consumed,
        producedBeforeFirstConsume,
        load: os.loadavg(),
    };
};

it('runs the manual launch measurements', async () => {
    assert(!process.env.CI, 'Manual measurements are excluded from CI');
    assert(output, 'Use run.py with --json and --markdown');
    if (process.env.MEASURE_MEMORY) {
        const result = await memoryRun();
        await writeFile(
            `${output}.${result.explores}.${result.mode}.json`,
            JSON.stringify(result, null, 2),
        );
        return;
    }
    const start = performance.now();
    const migrated = await createMigratedDatabase();
    const { database } = migrated;
    const f = await fixture(database).catch(async (error: unknown) => {
        await migrated.destroy();
        throw error;
    });
    const measure: typeof capture = (db, operation) =>
        capture(db, operation, f.warmSession);
    const repeat: typeof repeatedCapture = (db, count, operation) =>
        repeatedCapture(db, count, operation, f.warmSession);
    const results: Results = {
        environment: {
            date: new Date().toISOString(),
            commit: execFileSync('git', ['rev-parse', 'HEAD'], {
                encoding: 'utf8',
            }).trim(),
            cpu: os.cpus()[0].model,
            logicalCpus: os.cpus().length,
            memoryBytes: os.totalmem(),
            os: os.type(),
            node: process.version,
            postgres: (await database.raw('select version()')).rows[0].version,
            loadStart: os.loadavg(),
            warmups: 2,
            capabilities,
            dimensionsPerExplore: Number(process.env.MEASURE_DIMENSIONS ?? 40),
            metricsPerExplore: 10,
            baseExploresPerProject: 10,
        },
        A: [],
        B: [],
        C: [],
        D: [],
        overLimit: [],
    };
    try {
        for await (const count of sizes(
            'MEASURE_PROJECT_SIZES',
            '1,50,200,500,1000',
        )) {
            process.stdout.write(`Measuring ${count} projects\n`);
            await f.grow(count);
            await database('oauth2_access_tokens').delete();
            await database('agent_connection_grants').delete();
            if (count > 500) {
                const failure = async (operation: () => Promise<unknown>) => {
                    try {
                        await operation();
                    } catch (error) {
                        return (error as Error).message;
                    }
                    throw new Error(
                        'Expected the project limit to refuse this operation',
                    );
                };
                const grantFailure = await measure(database, () =>
                    failure(() => f.grant(count)),
                );
                const approvalFailure = await measure(database, () =>
                    failure(() =>
                        f.call(requestPath, {
                            method: 'POST',
                            body: JSON.stringify({
                                clientId: 'lightdash-cli',
                                name: 'measurement-connection',
                                projects: f.projectUuids.slice(0, count),
                                capabilities,
                                expiresInSeconds: 3600,
                                redirectUri: 'http://localhost:32123/callback',
                                state: 's'.repeat(43),
                                codeChallenge: 'c'.repeat(43),
                                codeChallengeMethod: 'S256',
                                resource: lightdashConfig.siteUrl,
                            }),
                        }),
                    ),
                );
                assert(approvalFailure.value.includes('too_many_projects'));
                assert(
                    grantFailure.value.includes(
                        'Invalid agent connection resource constraints',
                    ),
                );
                results.overLimit.push({
                    projects: count,
                    grantError: grantFailure.value,
                    approvalError: approvalFailure.value,
                    grant: summarize([grantFailure.sample]),
                    approval: summarize([approvalFailure.sample]),
                });
            } else {
                const connection = await f.bearer(count);
                const projectPath = `/api/v1/projects/${f.projectUuids[0]}`;
                if (count <= 500) {
                    for await (const [credential, headers] of [
                        ['session', {}],
                        ['pat', { authorization: `ApiKey ${f.pat.token}` }],
                        [
                            'connection',
                            { authorization: `Bearer ${connection.token}` },
                        ],
                    ] as const) {
                        const measurement = await repeat(
                            database,
                            Number(process.env.MEASURE_REQUEST_RUNS ?? 20),
                            () => f.call(projectPath, { headers }),
                        );
                        results.A.push({
                            projects: count,
                            grantProjects:
                                credential === 'connection' ? count : null,
                            credential,
                            measurement,
                        });
                    }
                    if (count === 500) {
                        const narrow = await f.bearer(1);
                        results.A.push({
                            projects: count,
                            grantProjects: 1,
                            credential: 'connection-fixed-person-control',
                            measurement: await repeat(database, 20, () =>
                                f.call(projectPath, {
                                    headers: {
                                        authorization: `Bearer ${narrow.token}`,
                                    },
                                }),
                            ),
                        });
                        await database('oauth2_access_tokens')
                            .where({
                                agent_connection_grant_uuid:
                                    narrow.connection.grantUuid,
                            })
                            .delete();
                        await database('agent_connection_grants')
                            .where({
                                agent_connection_grant_uuid:
                                    narrow.connection.grantUuid,
                            })
                            .delete();
                    }
                }
                const grantBytes = (
                    await database.raw(
                        'select pg_column_size(resource_constraints) as constraints, pg_column_size(g.*) as whole_row, octet_length(resource_constraints::text) as constraints_text from agent_connection_grants g where agent_connection_grant_uuid = ?',
                        [connection.connection.grantUuid],
                    )
                ).rows[0];
                const approvalSamples: Record<string, Sample[]> = {
                    request: [],
                    review: [],
                    decision: [],
                    total: [],
                };
                let pendingBytes: Record<string, number> | null = null;
                let aboveLimit: string | null = null;
                const createBody = {
                    clientId: 'lightdash-cli',
                    name: 'measurement-connection',
                    projects: f.projectUuids.slice(0, count),
                    capabilities,
                    expiresInSeconds: 3600,
                    redirectUri: 'http://localhost:32123/callback',
                    state: 's'.repeat(43),
                    codeChallenge: 'c'.repeat(43),
                    codeChallengeMethod: 'S256',
                    resource: lightdashConfig.siteUrl,
                };
                if (count <= 500) {
                    for await (const run of Array.from(
                        {
                            length:
                                Number(
                                    process.env.MEASURE_APPROVAL_RUNS ?? 10,
                                ) + 2,
                        },
                        (_, i) => i - 2,
                    )) {
                        await database(
                            'agent_connection_approval_requests',
                        ).delete();
                        const request = await measure(database, () =>
                            f.call(requestPath, {
                                method: 'POST',
                                body: JSON.stringify(createBody),
                            }),
                        );
                        const id = new URL(
                            request.value.results.authorizationUrl,
                        ).searchParams.get('agent_request')!;
                        [pendingBytes] = (
                            await database.raw(
                                'select pg_column_size(r.*) as whole_row, pg_column_size(requested_projects) as selected_projects from agent_connection_approval_requests r where agent_connection_approval_request_uuid = ?',
                                [id],
                            )
                        ).rows;
                        const review = await measure(database, () =>
                            f.call(`${requestPath}/${id}`),
                        );
                        const decision = await measure(database, () =>
                            f.call(`${requestPath}/${id}/decision`, {
                                method: 'POST',
                                body: JSON.stringify({
                                    decision: 'approve',
                                    nonce: review.value.results.nonce,
                                    revision: review.value.results.revision,
                                    projectUuids: f.projectUuids.slice(
                                        0,
                                        count,
                                    ),
                                    capabilities,
                                }),
                            }),
                        );
                        const selected = await database(
                            'agent_connection_approval_requests',
                        )
                            .where({
                                agent_connection_approval_request_uuid: id,
                            })
                            .first();
                        assert.equal(
                            Object.keys(
                                selected!.approved_selection!
                                    .resourceConstraints.projectCapabilities,
                            ).length,
                            count,
                        );
                        if (run >= 0) {
                            for (const [name, data] of Object.entries({
                                request,
                                review,
                                decision,
                            }))
                                approvalSamples[name].push(data.sample);
                            const parts = [
                                request.sample,
                                review.sample,
                                decision.sample,
                            ];
                            const total: Sample = {
                                ms: 0,
                                statements: 0,
                                reads: 0,
                                rows: 0,
                                readBytes: 0,
                                responseBytes: 0,
                                sql: {},
                            };
                            for (const part of parts) {
                                for (const key of [
                                    'ms',
                                    'statements',
                                    'reads',
                                    'rows',
                                    'readBytes',
                                    'responseBytes',
                                ] as const)
                                    total[key] += part[key];
                                for (const [sql, group] of Object.entries(
                                    part.sql,
                                )) {
                                    total.sql[sql] ??= {
                                        count: 0,
                                        rows: 0,
                                        bytes: 0,
                                        tables: group.tables,
                                    };
                                    total.sql[sql].count += group.count;
                                    total.sql[sql].rows += group.rows;
                                    total.sql[sql].bytes += group.bytes;
                                }
                            }
                            approvalSamples.total.push(total);
                        }
                    }
                } else {
                    try {
                        await f.call(requestPath, {
                            method: 'POST',
                            body: JSON.stringify(createBody),
                        });
                    } catch (error) {
                        aboveLimit = (error as Error).message;
                    }
                    assert(aboveLimit?.includes('too_many_projects'));
                }
                const status = await repeat(
                    database,
                    Number(process.env.MEASURE_APPROVAL_RUNS ?? 10),
                    () =>
                        f.call(
                            `/api/v2/user/agent-connections/${connection.connection.grantUuid}/status`,
                        ),
                );
                const checkStatus = await f.call(
                    `/api/v2/user/agent-connections/${connection.connection.grantUuid}/status`,
                );
                assert(
                    checkStatus.results.effectiveProjects.every(
                        (project: { capabilities: { allowed: boolean }[] }) =>
                            project.capabilities.every(
                                (capability) => capability.allowed,
                            ),
                    ),
                    'Status must measure allowed policy checks',
                );
                const list: Results['B'][number]['list'] = [];
                let grants = 1;
                for await (const target of sizes(
                    'MEASURE_LIST_SIZES',
                    '1,10,50',
                )) {
                    for await (const _ of Array.from({
                        length: target - grants,
                    })) {
                        await f.grant(count);
                        grants += 1;
                    }
                    const measurement = await repeat(
                        database,
                        Number(process.env.MEASURE_APPROVAL_RUNS ?? 10),
                        async () => {
                            const answer = await f.call(
                                '/api/v2/user/agent-connections',
                            );
                            assert.equal(answer.results.length, target);
                            return answer;
                        },
                    );
                    list.push({ connections: target, measurement });
                }
                results.B.push({
                    projects: count,
                    grantBytes,
                    pendingBytes,
                    approval: Object.fromEntries(
                        Object.entries(approvalSamples)
                            .filter(([, samples]) => samples.length)
                            .map(([name, samples]) => [
                                name,
                                summarize(samples),
                            ]),
                    ),
                    status,
                    list,
                    aboveLimit,
                });
            }
        }
        for await (const count of sizes(
            'MEASURE_EXPLORE_SIZES',
            '10,100,500,2000',
        )) {
            process.stdout.write(`Measuring ${count} stored explores\n`);
            const projectUuid = f.projectUuids[0];
            await database('cached_explore')
                .where({ project_uuid: projectUuid })
                .delete();
            for await (const offset of Array.from(
                { length: Math.ceil(count / 50) },
                (_, i) => i * 50,
            ))
                await database('cached_explore').insert(
                    Array.from(
                        { length: Math.min(50, count - offset) },
                        (_, i) => {
                            const item = explore(offset + i);
                            return {
                                project_uuid: projectUuid,
                                name: item.name,
                                table_names: [item.name],
                                explore: item,
                            };
                        },
                    ),
                );
            const databaseTextBytes = Number(
                (
                    await database.raw(
                        'select sum(octet_length(explore::text) + octet_length(cached_explore_uuid::text)) as bytes from cached_explore where project_uuid = ?',
                        [projectUuid],
                    )
                ).rows[0].bytes,
            );
            const heap: number[] = [];
            const loads: Sample[] = [];
            for await (const run of Array.from({ length: 12 }, (_, i) => i)) {
                global.gc!();
                const captured = await measure(database, async () => {
                    const before = process.memoryUsage().heapUsed;
                    const values = await f.models
                        .getProjectModel()
                        .getAllExploresFromCache(projectUuid);
                    heap.push(process.memoryUsage().heapUsed - before);
                    assert.equal(Object.keys(values).length, count);
                    return null;
                });
                if (run >= 2) loads.push(captured.sample);
            }
            const load = summarize(loads);
            let calls = 0;
            const original = f.models
                .getProjectModel()
                .getAllExploresFromCache.bind(f.models.getProjectModel());
            const spy = vi
                .spyOn(f.models.getProjectModel(), 'getAllExploresFromCache')
                .mockImplementation(async (id) => {
                    calls += 1;
                    return original(id);
                });
            const operations: Results['C'][number]['operations'] = [];
            const scope = f.context();
            const operation = async (
                name: string,
                run: () => Promise<unknown>,
                completed = true,
            ) => {
                calls = 0;
                const measured = await measure(database, () =>
                    agentExecutionContext.run(scope, run),
                );
                operations.push({
                    name,
                    calls,
                    measurement: summarize([measured.sample]),
                    completed,
                });
            };
            await operation('scheduled-refresh guard', () =>
                f.projectService.assertConnectionPreAggregateRefresh(
                    projectUuid,
                ),
            );
            await operation('stream preparation helper', async () => {
                const stream = await projectHooks(
                    f.projectService,
                ).prepareConnectionExploreStream(
                    projectUuid,
                    (async function* source() {
                        yield explore(0);
                    })(),
                );
                for await (const item of stream) assert(item.name);
            });
            const sink = vi
                .spyOn(
                    f.projectService as unknown as {
                        saveExploresAndIndexCatalog: () => Promise<{
                            indexCatalogJobUuid: string;
                        }>;
                    },
                    'saveExploresAndIndexCatalog',
                )
                .mockResolvedValue({
                    indexCatalogJobUuid: 'measurement',
                } as never);
            await operation(
                'default deploy guard chain (save sink stubbed)',
                () =>
                    f.projectService.saveDeployExplores({
                        projectUuid,
                        userUuid: f.person().userUuid,
                        organizationUuid: f.person().organizationUuid!,
                        explores: [explore(0)],
                        complete: true,
                        cliDeploy: { kind: 'default' },
                    } as never),
            );
            sink.mockRestore();
            await operation('parameter replacement', () =>
                f.projectService.replaceProjectParameters({
                    user: f.person(),
                    projectUuid,
                    parameters: {},
                }),
            );
            const hooks = projectHooks(f.projectService);
            const adapter = {
                getDbtPackages: async () => ({}),
                prepareExploreStream: async () =>
                    (async function* source() {
                        yield explore(0);
                    })(),
                getLightdashProjectConfig: async () => ({ parameters: {} }),
                destroy: async () => {},
            };
            const adapterScope = vi
                .spyOn(hooks, 'withCompileAdapter')
                .mockImplementation(async (_id, _user, consume) =>
                    consume({ adapter } as never),
                );
            const resolver = vi
                .spyOn(hooks, 'resolveCompileAdapter')
                .mockResolvedValue({ adapter } as never);
            const projectContext = vi
                .spyOn(hooks, 'getProjectContextFromAdapter')
                .mockResolvedValue(undefined);
            const effects = vi
                .spyOn(f.projectService, 'assertAgentConnectionEffect')
                .mockResolvedValue(fromSession(f.person(), ''));
            const yaml = vi
                .spyOn(hooks, 'replaceYamlTagsWithoutPermissionCheck')
                .mockResolvedValue(undefined);
            const deleteManifest = vi
                .spyOn(hooks, 'deleteMergedManifestBestEffort')
                .mockResolvedValue(undefined);
            const persistManifest = vi
                .spyOn(hooks, 'persistMergedManifest')
                .mockResolvedValue(undefined);
            const saveSink = vi
                .spyOn(hooks, 'saveExploresAndIndexCatalog')
                .mockResolvedValue({
                    indexCatalogJobUuid: 'measurement',
                } as never);
            let steps = 0;
            let scheduled = 0;
            Object.assign(f.projectService, {
                analytics: { track: () => {} },
                jobModel: {
                    create: async () => {},
                    update: async () => {},
                    tryJobStep: async (
                        _job: string,
                        _step: string,
                        run: () => Promise<unknown>,
                    ) => {
                        steps += 1;
                        return run();
                    },
                },
                schedulerClient: {
                    compileProject: async () => {
                        scheduled += 1;
                    },
                },
            });
            await operation('refresh stream flow (synthetic adapter)', () =>
                hooks.refreshTablesAndProjectConfig(
                    f.person(),
                    projectUuid,
                    RequestMethod.CLI,
                    undefined,
                    async (prepared) => {
                        let received = 0;
                        for await (const item of prepared.exploreStream) {
                            assert(item.name);
                            received += 1;
                        }
                        assert.equal(received, 1);
                    },
                ),
            );
            await operation('compile scheduling (queue sink stubbed)', () =>
                f.projectService.scheduleCompileProject(
                    f.person(),
                    projectUuid,
                    RequestMethod.CLI,
                ),
            );
            assert.equal(scheduled, 1);
            await operation(
                'compile execution (synthetic adapter, save/job sinks stubbed)',
                () =>
                    f.projectService.compileProject(
                        f.person(),
                        projectUuid,
                        RequestMethod.CLI,
                        'measurement',
                    ),
            );
            assert.equal(steps, 1);
            for (const mock of [
                adapterScope,
                resolver,
                projectContext,
                effects,
                yaml,
                deleteManifest,
                persistManifest,
                saveSink,
            ])
                mock.mockRestore();
            const stop = new Error('measurement boundary');
            const prefix = async (name: string, run: () => Promise<unknown>) =>
                operation(
                    name,
                    async () => {
                        try {
                            await run();
                        } catch (error) {
                            if (error === stop) return;
                            throw error;
                        }
                        throw new Error('Boundary was not reached');
                    },
                    false,
                );
            const summary = vi
                .spyOn(f.models.getProjectModel(), 'getSummary')
                .mockRejectedValue(stop);
            await prefix('virtual-view create entry (stops after guard)', () =>
                f.projectService.createVirtualView(
                    fromSession(f.person(), ''),
                    projectUuid,
                    { name: 'measurement' } as never,
                ),
            );
            summary.mockRestore();
            const find = vi
                .spyOn(f.projectService, 'findExplores')
                .mockRejectedValue(stop);
            await prefix('virtual-view update entry (stops after guard)', () =>
                f.projectService.updateVirtualView(
                    fromSession(f.person(), ''),
                    projectUuid,
                    'measurement',
                    {} as never,
                ),
            );
            find.mockRestore();
            spy.mockRestore();
            results.C.push({
                explores: count,
                sourceJsonBytes: Array.from({ length: count }, (_, i) =>
                    byteSize(explore(i)),
                ).reduce((a, b) => a + b, 0),
                databaseTextBytes,
                load,
                heapGrowth: stats(heap.slice(2)),
                operations,
            });
        }
        for await (const count of sizes(
            'MEASURE_COMPILE_SIZES',
            '100,500,2000',
        ))
            for await (const mode of ['streaming', 'buffered']) {
                try {
                    results.D.push(
                        JSON.parse(
                            await readFile(
                                `${output}.${count}.${mode}.json`,
                                'utf8',
                            ),
                        ),
                    );
                } catch {
                    throw new Error(
                        `Missing isolated memory result for ${count}/${mode}; run run.py`,
                    );
                }
            }
        results.environment.loadEnd = os.loadavg();
        results.environment.databasePhaseSeconds =
            (performance.now() - start) / 1000;
        await writeFile(output, JSON.stringify(results, null, 2));
        const markdown = renderReport(results);
        await writeFile(process.env.MEASUREMENT_MARKDOWN!, markdown);
        console.log(markdown);
    } finally {
        await f.close();
        await migrated.destroy();
        vi.restoreAllMocks();
    }
});
