// Not covered: a worker killed mid-job (no SIGKILL case).
// Not covered: a real NATS broker.
import {
    AgentCapability,
    DeploySessionStatus,
    JobStatusType,
    RequestMethod,
    SchedulerJobStatus,
    SupportedDbtVersions,
    type DbtManifest,
    type DbtModelNode,
} from '@lightdash/common';
import { type Job } from 'graphile-worker';
import { gunzipSync, gzipSync } from 'node:zlib';
import Logger from '../../../logging/logger';
import { DbtManifestProjectAdapter } from '../../../projectAdapters/dbtManifestProjectAdapter';
import * as projectAdapter from '../../../projectAdapters/projectAdapter';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import { catalogEvidence } from './agentQueueCatalog.mock';
import {
    evidenceGate,
    evidenceResources,
    installEvidenceJson,
    queueEvidenceFixture,
} from './agentQueueEvidence.mock';
import { isConnectionStatement } from './agentQueueState.mock';
import { captureSql } from './deploySessionFixture.mock';
import { dbtManifest } from './multiConnectionCompileFixtures';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
let f: Awaited<ReturnType<typeof queueEvidenceFixture>>;
let resources: ReturnType<typeof evidenceResources>;
const gates: ReturnType<typeof evidenceGate>[] = [];
const names = ['extra_one', 'extra_two', 'overlay', 'primary'];
let revision = 'new';
let restoreJson: () => void;
const manifest = (name: string, label: string) =>
    dbtManifest(name, [
        {
            name,
            label,
            database: migrated.databaseName,
            table: `evidence_warehouse_${name}`,
        },
    ]);
beforeAll(async () => {
    restoreJson = installEvidenceJson();
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
    await Promise.all(
        names.map(async (name) => {
            await migrated.database.schema.createTable(
                `evidence_warehouse_${name}`,
                (table) => table.integer('id'),
            );
            await migrated
                .database(`evidence_warehouse_${name}`)
                .insert({ id: 1 });
        }),
    );
});
beforeEach(async () => {
    vi.spyOn(Logger, 'debug').mockImplementation(() => Logger);
    resources = evidenceResources();
    f = await queueEvidenceFixture(migrated, resources);
    revision = 'new';
    vi.spyOn(projectAdapter, 'projectAdapterFromConfig').mockImplementation(
        async (dbt, warehouseClient, cachedWarehouse) => {
            const name =
                'repository' in dbt ? dbt.repository.split('/')[1] : 'primary';
            return new DbtManifestProjectAdapter({
                parsedManifest: manifest(name, revision),
                warehouseClient,
                cachedWarehouse,
                dbtVersion: SupportedDbtVersions.V1_8,
            });
        },
    );
});
afterEach(async () => {
    gates.splice(0).forEach((gate) => gate.release());
    try {
        await resources?.close();
    } finally {
        vi.restoreAllMocks();
        await migrated.database
            .withSchema('graphile_worker')
            .table('jobs')
            .delete();
    }
    expect(await migrated.database('oauth2_access_tokens')).toEqual([]);
    expect(await migrated.database('oauth2_refresh_tokens')).toEqual([]);
});
afterAll(async () => {
    try {
        await migrated?.destroy();
    } finally {
        restoreJson?.();
    }
});

const decoded = (bytes: Buffer) => {
    try {
        const value = JSON.parse(gunzipSync(bytes).toString()) as DbtManifest;
        return Object.values(value.nodes as Record<string, DbtModelNode>)
            .map((node) => ({ name: node.name, revision: node.meta?.label }))
            .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        throw new Error('Cannot decode persisted manifest', { cause: error });
    }
};
const completed = [
    SchedulerJobStatus.SCHEDULED,
    SchedulerJobStatus.STARTED,
    SchedulerJobStatus.COMPLETED,
];
const waitGone = async (id: string) =>
    vi.waitFor(
        async () =>
            expect((await f.rows()).some((row) => row.id === id)).toBe(false),
        { timeout: 20000, interval: 25 },
    );
const drainChildren = async () => {
    await f.start(['indexCatalog', 'validateProject', 'replaceCustomFields']);
    await vi.waitFor(async () => expect(await f.rows()).toEqual([]), {
        timeout: 20000,
        interval: 25,
    });
    await f.stop();
};
const ordinaryCompile = async () => {
    await f.service.scheduleCompileProject(
        f.user,
        f.projectUuid,
        RequestMethod.CLI,
    );
    const parent = (await f.rows()).find(
        (row) => row.task_identifier === 'compileProject',
    )!;
    await f.start(['compileProject']);
    await waitGone(parent.id);
    await vi.waitFor(
        async () =>
            expect(
                (await f.rows()).map((row) => row.task_identifier).sort(),
            ).toEqual([
                'indexCatalog',
                'replaceCustomFields',
                'validateProject',
            ]),
        { timeout: 10000 },
    );
    await f.stop();
    await resources.settle();
    const children = await f.rows();
    await vi.waitFor(
        async () => {
            expect(
                await Promise.all(
                    children.map(async (child) =>
                        (await f.logs(child.id)).map((log) => log.status),
                    ),
                ),
            ).toEqual(children.map(() => [SchedulerJobStatus.SCHEDULED]));
        },
        { timeout: 10000, interval: 25 },
    );
    await drainChildren();
    expect(
        await Promise.all(
            children.map(async (child) =>
                (await f.logs(child.id)).map((log) => log.status),
            ),
        ),
    ).toEqual(children.map(() => completed));
    return { parent, children };
};
const projectState = async (jobs: Awaited<ReturnType<typeof f.rows>>) => {
    const explores = await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid)
        .orderBy('name');
    const catalog = await migrated
        .database('catalog_search')
        .where('project_uuid', f.projectUuid);
    const original = await migrated
        .database('project_merged_manifests')
        .where('project_uuid', f.projectUuid);
    const extras = await migrated
        .database('warehouse_connection_manifests as m')
        .join(
            'warehouse_connections as c',
            'c.warehouse_connection_uuid',
            'm.warehouse_connection_uuid',
        )
        .where('c.project_uuid', f.projectUuid)
        .select('c.name', 'm.manifest')
        .orderBy('c.name');
    const parents = jobs.filter(
        (job) => job.task_identifier === 'compileProject',
    );
    return {
        explores: explores.map((row) => ({
            name: row.name,
            revision: row.explore.label,
        })),
        catalog: {
            count: catalog.length,
            exploreNames: [
                ...new Set(
                    catalog.map(
                        (row) =>
                            explores.find(
                                (explore) =>
                                    explore.cached_explore_uuid ===
                                    row.cached_explore_uuid,
                            )?.name,
                    ),
                ),
            ].sort(),
            allBelongToCurrentExplores: catalog.every((row) =>
                explores.some(
                    (explore) =>
                        explore.cached_explore_uuid === row.cached_explore_uuid,
                ),
            ),
        },
        manifests: {
            original: original.map((row) => decoded(row.manifest)),
            extra: extras.map((row) => ({
                name: row.name,
                models: decoded(row.manifest),
            })),
        },
        registry: await migrated
            .database('pre_aggregate_definitions')
            .where('project_uuid', f.projectUuid),
        schedules: await migrated
            .database('scheduler')
            .where('project_uuid', f.projectUuid),
        pending: (await f.rows()).map((row) => row.task_identifier),
        jobs: await Promise.all(
            jobs.map(async (job) => ({
                task: job.task_identifier,
                bound: !!job.payload.agentConnectionExecution,
                statuses: (await f.logs(job.id)).map((log) => log.status),
            })),
        ),
        legacy: await Promise.all(
            parents.map(
                async (job) =>
                    (await f.jobModel.get(String(job.payload.jobUuid)))
                        .jobStatus,
            ),
        ),
    };
};
const expectedManifests = (label: string) => ({
    original: [
        [
            { name: 'overlay', revision: label },
            { name: 'primary', revision: label },
        ],
    ],
    extra: ['extra_one', 'extra_two'].map((name) => ({
        name,
        models: [{ name, revision: label }],
    })),
});

test.each(['absent', 'old'])(
    'refused multi-connection compile with %s manifests retains catalog publication and the next ordinary compile repairs the whole project',
    async (starting) => {
        await f.configureMultiCompile();
        if (starting === 'old') {
            const old = manifest('primary', 'old');
            old.nodes = { ...old.nodes, ...manifest('overlay', 'old').nodes };
            await f.projects.upsertMergedManifest(
                f.projectUuid,
                gzipSync(JSON.stringify(old)),
            );
            const connections =
                await f.warehouseConnectionCompileModel.getCompileConnections(
                    f.projectUuid,
                );
            await Promise.all(
                connections
                    .filter((connection) => !connection.isOriginal)
                    .map((connection) =>
                        f.warehouseConnectionCompileModel.saveCompileArtifacts(
                            f.projectUuid,
                            connection.warehouseConnectionUuid,
                            {
                                manifest: gzipSync(
                                    JSON.stringify(
                                        manifest(connection.name, 'old'),
                                    ),
                                ),
                                catalog: null,
                            },
                        ),
                    ),
            );
        }
        const gate = evidenceGate(
            'multi compile log committed before manifests',
        );
        gates.push(gate);
        const insert = f.compileLogs.insert.bind(f.compileLogs);
        vi.spyOn(f.compileLogs, 'insert').mockImplementationOnce(
            async (...args) => {
                const result = await insert(...args);
                await gate.pause();
                return result;
            },
        );
        await f.enqueue('compileProject');
        const [parent] = await f.rows();
        await f.start(['compileProject']);
        let child: Awaited<ReturnType<typeof f.rows>>[number];
        try {
            await gate.waitForArrival();
            [child] = (await f.rows()).filter(
                (row) => row.task_identifier === 'indexCatalog',
            );
            expect(child).toMatchObject({
                attempts: 0,
                max_attempts: 1,
                locked_by: null,
                key: null,
            });
            expect(child.payload).not.toHaveProperty(
                'agentConnectionExecution',
            );
            expect(
                await migrated
                    .database('catalog_search')
                    .where('project_uuid', f.projectUuid),
            ).toEqual([]);
            await f.refuse('revoked', 'compileProject');
        } finally {
            gate.release();
        }
        await waitGone(parent.id);
        await f.stop();
        const checks = vi.spyOn(f.executions, 'assertActiveExecution');
        await drainChildren();
        expect(checks).not.toHaveBeenCalled();
        const refusedJob = {
            task: 'compileProject',
            bound: true,
            statuses: [
                SchedulerJobStatus.SCHEDULED,
                SchedulerJobStatus.STARTED,
                SchedulerJobStatus.ERROR,
                SchedulerJobStatus.ERROR,
            ],
        };
        const indexJob = {
            task: 'indexCatalog',
            bound: false,
            statuses: completed,
        };
        const expected = {
            explores: names.map((name) => ({ name, revision: 'new' })),
            catalog: {
                count: 8,
                exploreNames: names,
                allBelongToCurrentExplores: true,
            },
            manifests:
                starting === 'old'
                    ? expectedManifests('old')
                    : { original: [], extra: [] },
            registry: [],
            schedules: [],
            pending: [],
            jobs: [refusedJob, indexJob],
            legacy: [JobStatusType.ERROR],
        };
        // LIKELY DEFECT: product decision pending (catalog indexing after a refusal)
        expect(await projectState([parent, child])).toEqual(expected);
        expect((await f.logs(parent.id)).at(-1)?.details).toMatchObject({
            error: 'This agent connection is no longer available for this operation.',
        });
        revision = 'repaired';
        const recovery = await ordinaryCompile();
        expect(
            await projectState([
                parent,
                child,
                recovery.parent,
                ...recovery.children,
            ]),
        ).toEqual({
            ...expected,
            explores: names.map((name) => ({ name, revision: 'repaired' })),
            manifests: expectedManifests('repaired'),
            jobs: [
                refusedJob,
                indexJob,
                { task: 'compileProject', bound: false, statuses: completed },
                ...recovery.children.map((job) => ({
                    task: job.task_identifier,
                    bound: false,
                    statuses: completed,
                })),
            ],
            legacy: [JobStatusType.ERROR, JobStatusType.DONE],
        });
        console.info(
            'PROJECT_RECOVERY_EVIDENCE',
            JSON.stringify(
                await projectState([
                    parent,
                    child,
                    recovery.parent,
                    ...recovery.children,
                ]),
                (_key, value) =>
                    typeof value === 'bigint' ? value.toString() : value,
            ),
        );
    },
);

const stagedDeploy = async () => {
    const session = await f.sessions.createSession(f.projectUuid, f.userUuid);
    await f.deploy.addDeployBatch(
        f.user,
        f.projectUuid,
        session,
        [validExplore],
        0,
        true,
    );
    return session;
};
const finalizeConnection = async (session: string) => {
    const { scope } = await f.executions.assertActiveExecution(
        {
            ...f.execution,
            operation: {
                kind: 'rest',
                key: 'DeployController.finalizeDeploySession',
            },
        },
        {
            projectUuid: f.projectUuid,
            capabilities: [AgentCapability.DeployUpload],
            recheckOperation: true,
        },
    );
    return agentExecutionContext.run(scope, () =>
        f.deploy.finalizeDeploy(f.user, f.projectUuid, session),
    );
};
test('late validation refusal in finalize keeps published explores and a failed session', async () => {
    const session = await stagedDeploy();
    const gate = evidenceGate(
        'finalize saveDeployExplores committed before validation',
    );
    gates.push(gate);
    const save = f.service.saveDeployExplores.bind(f.service);
    vi.spyOn(f.service, 'saveDeployExplores').mockImplementationOnce(
        async (...args) => {
            const result = await save(...args);
            await gate.pause();
            return result;
        },
    );
    const outcome = resources.track(
        finalizeConnection(session).then(
            (value) => ({ value, error: null }),
            (error: unknown) => ({ value: null, error }),
        ),
    );
    try {
        await gate.waitForArrival();
        expect((await f.sessions.getSession(session)).status).toBe(
            DeploySessionStatus.FINALIZING,
        );
        await f.refuse('revoked', 'validateProject');
    } finally {
        gate.release();
        await outcome;
    }
    // LIKELY DEFECT: late validation refusal leaves published explores and a FAILED session.
    expect(await outcome).toMatchObject({
        value: null,
        error: { statusCode: 403 },
    });
    expect({
        status: (await f.sessions.getSession(session)).status,
        explores: await f.projects.getCachedExploreNames(f.projectUuid),
        tasks: (await f.rows()).map((row) => row.task_identifier),
        batches: (
            await migrated
                .database('deploy_session_batch_explores')
                .where('deploy_session_uuid', session)
        ).length,
    }).toEqual({
        status: DeploySessionStatus.FAILED,
        explores: ['valid_explore'],
        tasks: ['indexCatalog'],
        batches: 1,
    });
    expect((await f.rows())[0].payload).not.toHaveProperty(
        'agentConnectionExecution',
    );
});

test('ordinary finalize publishes, queues validation and deletes its session without connection statements', async () => {
    const session = await stagedDeploy();
    const checks = vi.spyOn(f.executions, 'assertActiveExecution');
    const sql = captureSql(migrated.database);
    try {
        expect(
            await f.deploy.finalizeDeploy(f.user, f.projectUuid, session),
        ).toMatchObject({
            status: DeploySessionStatus.COMPLETED,
            exploreCount: 1,
        });
        expect((await f.rows()).map((row) => row.task_identifier)).toEqual([
            'indexCatalog',
            'validateProject',
        ]);
        expect(
            (await f.rows()).every(
                (row) => !row.payload.agentConnectionExecution,
            ),
        ).toBe(true);
        const children = await f.rows();
        await drainChildren();
        expect(
            await Promise.all(
                children.map(async (child) =>
                    (await f.logs(child.id)).map((log) => log.status),
                ),
            ),
        ).toEqual(children.map(() => completed));
        expect(checks).not.toHaveBeenCalled();
        expect(sql.statements.filter(isConnectionStatement)).toEqual([]);
        expect(
            sql.statements.some((statement) =>
                /insert into.*cached_explore/i.test(statement),
            ),
        ).toBe(true);
    } finally {
        sql.stop();
    }
    expect(
        await migrated
            .database('deploy_sessions')
            .where('deploy_session_uuid', session),
    ).toEqual([]);
    expect(
        await migrated
            .database('deploy_session_batch_explores')
            .where('deploy_session_uuid', session),
    ).toEqual([]);
    expect(await f.projects.getCachedExploreNames(f.projectUuid)).toEqual([
        'valid_explore',
    ]);
});

test('finalize cleanup failure with failed status write masks the first service-call failure', async () => {
    const session = await stagedDeploy();
    vi.spyOn(f.sessions, 'deleteSession').mockRejectedValueOnce(
        new Error('cleanup service failure'),
    );
    const update = f.sessions.updateStatus.bind(f.sessions);
    vi.spyOn(f.sessions, 'updateStatus').mockImplementation(async (...args) => {
        if (args[1] === DeploySessionStatus.FAILED)
            throw new Error('status service failure');
        return update(...args);
    });
    // LIKELY DEFECT: failure to mark cleanup failure masks the cause and retains COMPLETED with batches.
    await expect(finalizeConnection(session)).rejects.toThrow(
        'status service failure',
    );
    expect((await f.sessions.getSession(session)).status).toBe(
        DeploySessionStatus.COMPLETED,
    );
    expect(await f.projects.getCachedExploreNames(f.projectUuid)).toEqual([
        'valid_explore',
    ]);
    expect(
        (await f.rows()).map((row) => ({
            task: row.task_identifier,
            bound: !!row.payload.agentConnectionExecution,
        })),
    ).toEqual([
        { task: 'indexCatalog', bound: false },
        { task: 'validateProject', bound: true },
    ]);
    expect(
        (
            await migrated
                .database('deploy_session_batch_explores')
                .where('deploy_session_uuid', session)
        ).length,
    ).toBe(1);
});

test('ordinary single compile and its children complete without connection statements', async () => {
    await f.configureMultiCompile(false);
    const checks = vi.spyOn(f.executions, 'assertActiveExecution');
    const sql = captureSql(migrated.database);
    try {
        const { parent, children } = await ordinaryCompile();
        expect(
            (await f.jobModel.get(String(parent.payload.jobUuid))).jobStatus,
        ).toBe(JobStatusType.DONE);
        expect(parent.payload).not.toHaveProperty('agentConnectionExecution');
        expect(
            children.every((row) => !row.payload.agentConnectionExecution),
        ).toBe(true);
        expect((await f.logs(parent.id)).map((log) => log.status)).toEqual(
            completed,
        );
        expect(await f.projects.getCachedExploreNames(f.projectUuid)).toEqual([
            'primary',
        ]);
        expect(checks).not.toHaveBeenCalled();
        expect(sql.statements.filter(isConnectionStatement)).toEqual([]);
        expect(
            sql.statements.some((statement) =>
                /insert into.*cached_explore/i.test(statement),
            ),
        ).toBe(true);
    } finally {
        sql.stop();
    }
});

test('forced replay after a validation child is added duplicates unkeyed children', async () => {
    await f.configureMultiCompile(false);
    const generate = f.schedulerClient.generateValidation.bind(
        f.schedulerClient,
    );
    vi.spyOn(f.schedulerClient, 'generateValidation').mockImplementationOnce(
        async (...args) => {
            await generate(...args);
            throw new Error('failure injected after real validation enqueue');
        },
    );
    await f.enqueue('compileProject');
    const [parent] = await f.rows();
    await f.start(['compileProject']);
    await vi.waitFor(
        async () =>
            expect(
                (await f.rows()).find((row) => row.id === parent.id),
            ).toMatchObject({
                attempts: 1,
                max_attempts: 1,
                locked_by: null,
                last_error: 'failure injected after real validation enqueue',
            }),
        { timeout: 20000 },
    );
    await f.stop();
    // LIKELY DEFECT: a compile logged as completed and then as failed retains a DONE legacy job.
    expect(
        (await f.jobModel.get(String(parent.payload.jobUuid))).jobStatus,
    ).toBe(JobStatusType.DONE);
    expect((await f.logs(parent.id)).map((log) => log.status)).toEqual([
        ...completed,
        SchedulerJobStatus.ERROR,
    ]);
    const firstExplores = await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid)
        .select('cached_explore_uuid');
    expect(firstExplores).toHaveLength(1);
    const first = (await f.rows()).filter((row) => row.id !== parent.id);
    expect(first.map((row) => row.task_identifier)).toEqual([
        'indexCatalog',
        'validateProject',
    ]);
    expect(first.map((row) => row.key)).toEqual([null, null]);
    const failed = (await f.rows()).find((row) => row.id === parent.id)!;
    expect(failed.run_at.getTime()).toBeGreaterThanOrEqual(
        parent.run_at.getTime(),
    );
    await migrated
        .database<Job>('graphile_worker.jobs')
        .where({ id: parent.id, locked_by: null })
        .update({ max_attempts: 2, run_at: new Date() });
    await f.start(['compileProject']);
    await waitGone(parent.id);
    await f.stop();
    const children = await f.rows();
    // LIKELY DEFECT: forced replay repeats publication and creates duplicate unkeyed children.
    expect(children.map((row) => row.task_identifier)).toEqual([
        'indexCatalog',
        'validateProject',
        'indexCatalog',
        'validateProject',
        'replaceCustomFields',
    ]);
    expect(
        children
            .filter((row) => row.task_identifier === 'indexCatalog')
            .map((row) => row.key),
    ).toEqual([null, null]);
    const replayExplores = await migrated
        .database('cached_explore')
        .where('project_uuid', f.projectUuid)
        .select('cached_explore_uuid');
    expect(replayExplores).toHaveLength(1);
    // The replayed compile upserts the surviving explore, so it keeps its uuid
    expect(replayExplores[0].cached_explore_uuid).toBe(
        firstExplores[0].cached_explore_uuid,
    );
    const validations = children.filter(
        (row) => row.task_identifier === 'validateProject',
    );
    expect(
        validations.map((row) => ({
            project: row.payload.projectUuid,
            execution: row.payload.agentConnectionExecution,
            key: row.key,
        })),
    ).toEqual(
        [1, 2].map(() => ({
            project: f.projectUuid,
            execution: f.execution,
            key: null,
        })),
    );
    expect((await f.logs(parent.id)).map((log) => log.status)).toEqual([
        ...completed,
        SchedulerJobStatus.ERROR,
        SchedulerJobStatus.STARTED,
        SchedulerJobStatus.COMPLETED,
    ]);
    await drainChildren();
    expect(
        (await f.jobModel.get(String(parent.payload.jobUuid))).jobStatus,
    ).toBe(JobStatusType.DONE);
});

test.each(['tags', 'edges'] as const)(
    'catalog fault after %s restoration preserves partial writes and forced replay restores metadata',
    async (boundary) => {
        const evidence = await catalogEvidence(migrated.database, f);
        const [queued] = await f.rows();
        const failure = new Error(
            'failure injected at the service call after restoration',
        );
        if (boundary === 'tags') {
            const call = f.catalogService.migrateCatalogItemTags.bind(
                f.catalogService,
            );
            vi.spyOn(
                f.catalogService,
                'migrateCatalogItemTags',
            ).mockImplementationOnce(async (...args) => {
                await call(...args);
                throw failure;
            });
        } else {
            const call = f.catalogService.migrateMetricsTreeEdges.bind(
                f.catalogService,
            );
            vi.spyOn(
                f.catalogService,
                'migrateMetricsTreeEdges',
            ).mockImplementationOnce(async (...args) => {
                await call(...args);
                throw failure;
            });
        }
        await f.start(['indexCatalog']);
        await vi.waitFor(
            async () =>
                expect(await f.rows()).toEqual([
                    expect.objectContaining({
                        id: queued.id,
                        attempts: 1,
                        max_attempts: 1,
                        locked_by: null,
                        last_error:
                            'failure injected at the service call after restoration',
                    }),
                ]),
            { timeout: 10000 },
        );
        await f.stop();
        // LIKELY DEFECT: an exhausted catalog job retains only the metadata restored before its failure.
        expect(await evidence.state()).toEqual({
            ...evidence.restored,
            icons: boundary === 'tags' ? [] : evidence.restored.icons,
            edges: boundary === 'tags' ? [] : evidence.restored.edges,
            nodes: [],
        });
        expect((await f.logs(queued.id)).map((log) => log.status)).toEqual([
            SchedulerJobStatus.SCHEDULED,
            SchedulerJobStatus.STARTED,
            SchedulerJobStatus.ERROR,
        ]);
        await migrated
            .database<Job>('graphile_worker.jobs')
            .where({ id: queued.id, locked_by: null })
            .update({ max_attempts: 2, run_at: new Date() });
        await f.start(['indexCatalog']);
        await waitGone(queued.id);
        await f.stop();
        expect(await evidence.state()).toEqual(evidence.restored);
        expect((await f.logs(queued.id)).map((log) => log.status)).toEqual([
            SchedulerJobStatus.SCHEDULED,
            SchedulerJobStatus.STARTED,
            SchedulerJobStatus.ERROR,
            SchedulerJobStatus.STARTED,
            SchedulerJobStatus.COMPLETED,
        ]);
    },
);

test('unbound catalog indexing restores UI metadata after the connection is revoked', async () => {
    const evidence = await catalogEvidence(migrated.database, f);
    const [queued] = await f.rows();
    expect(queued.payload).not.toHaveProperty('agentConnectionExecution');
    await f.refuse('revoked', 'compileProject');
    const checks = vi.spyOn(f.executions, 'assertActiveExecution');
    await f.start(['indexCatalog']);
    await waitGone(queued.id);
    await f.stop();
    // LIKELY DEFECT: product decision pending (catalog indexing after a refusal)
    expect(await evidence.state()).toEqual(evidence.restored);
    expect(checks).not.toHaveBeenCalled();
    expect((await f.logs(queued.id)).map((log) => log.status)).toEqual(
        completed,
    );
});
