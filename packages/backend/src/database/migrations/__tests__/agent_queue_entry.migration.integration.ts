// Not covered: a worker killed mid-job (no SIGKILL case).
// Not covered: a real NATS broker.
import {
    JobStatusType,
    JobStepStatusType,
    SchedulerJobStatus,
    type AgentConnectionTaskEffect,
} from '@lightdash/common';
import { writeSync } from 'node:fs';
import Logger from '../../../logging/logger';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import {
    evidenceGate,
    evidenceResources,
    queueEvidenceFixture,
} from './agentQueueEvidence.mock';
import { protectedRows, seedProtectedRows } from './agentQueueState.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});

let migrated: MigratedDatabase;
let f: Awaited<ReturnType<typeof queueEvidenceFixture>>;
let resources: ReturnType<typeof evidenceResources>;
const gates: ReturnType<typeof evidenceGate>[] = [];
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
});
beforeEach(async () => {
    vi.spyOn(Logger, 'debug').mockImplementation(() => Logger);
    resources = evidenceResources();
    f = await queueEvidenceFixture(migrated, resources);
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
afterAll(async () => migrated?.destroy());

const consumed = async () =>
    vi.waitFor(async () => expect(await f.rows()).toEqual([]), {
        timeout: 10000,
        interval: 25,
    });
const effects: AgentConnectionTaskEffect[] = [
    'compileProject',
    'validateProject',
    'replaceCustomFields',
    'materializePreAggregate',
];
const omittedPreservationTables = [
    'saved_queries_version_sorts',
    'saved_queries_version_table_calculations',
    'saved_queries_version_custom_dimensions',
    'saved_queries_version_additional_metrics',
    'saved_queries_version_custom_sql_dimensions',
    'tags',
    'catalog_search_tags',
    'metrics_tree_edges',
    'metrics_tree_nodes',
    'project_context_document',
    'cached_warehouse',
    'warehouse_connection_catalog_cache',
];
const reasons = [
    'revoked',
    'expired',
    'project removed',
    'required action removed',
    'person deactivated',
];

describe.each(effects)('%s real queue entry', (effect) => {
    test.each(reasons)(
        `consumes %s refusal before body entry and preserves 17 seeded tables (excludes ${omittedPreservationTables.join(', ')})`,
        async (reason) => {
            await seedProtectedRows(migrated.database, f);
            const credentialEntry = vi.spyOn(
                f.service.warehouseClientFactory,
                'resolveWarehouseCredentials',
            );
            const compile = vi.spyOn(f.service, 'compileProject');
            const validate = vi.spyOn(
                f.validationService,
                'generateValidation',
            );
            const replace = vi.spyOn(f.service, 'findReplaceableCustomFields');
            const materialize = vi.spyOn(
                f.materializationService,
                'materializePreAggregate',
            );
            const session = vi.spyOn(f.userService, 'getSessionByUserUuid');
            await f.enqueue(effect);
            const [queued] = await f.rows();
            expect(queued).toMatchObject({
                task_identifier: effect,
                attempts: 0,
                max_attempts: 1,
                locked_by: null,
                last_error: null,
            });
            expect(queued.payload.agentConnectionExecution).toEqual(
                f.execution,
            );
            await f.refuse(reason, effect);
            if (
                reason === 'project removed' ||
                reason === 'required action removed'
            ) {
                const active = await f.grants.findActive(
                    f.grant.grantUuid,
                    new Date(),
                );
                expect(
                    active,
                    'narrowed grant must remain a valid active grant',
                ).not.toBeNull();
                expect(active).toMatchObject({
                    grantUuid: f.grant.grantUuid,
                    grantRevision: f.execution.revision,
                    revokedAt: null,
                });
                if (reason === 'project removed') {
                    expect(active!.approvedProjectUuids).toEqual([
                        f.retainedProjectUuid,
                    ]);
                } else {
                    expect(active!.approvedCapabilities).toEqual(
                        f.grant.approvedCapabilities.filter(
                            (capability) =>
                                capability !== f.requiredCapability[effect],
                        ),
                    );
                }
            }
            const before = await protectedRows(migrated.database);
            await f.start([effect]);
            await consumed();
            await f.stop();
            expect(await protectedRows(migrated.database)).toEqual(before);
            for (const spy of [
                credentialEntry,
                compile,
                validate,
                replace,
                materialize,
                session,
            ])
                expect(spy).not.toHaveBeenCalled();
            expect((await f.logs(queued.id)).map((log) => log.status)).toEqual([
                SchedulerJobStatus.SCHEDULED,
                SchedulerJobStatus.ERROR,
            ]);
            expect(
                (await f.logs(queued.id))
                    .filter((log) => log.status === SchedulerJobStatus.ERROR)
                    .map((log) => log.details?.error),
            ).toEqual([
                'This agent connection is no longer available for this operation.',
            ]);
            if (effect === 'compileProject') {
                const legacy = await f.jobModel.get(
                    String(queued.payload.jobUuid),
                );
                expect(legacy).toMatchObject({
                    jobStatus: JobStatusType.ERROR,
                    jobResults: null,
                });
                expect(legacy.steps.map((step) => step.stepError)).toEqual([
                    null,
                ]);
            }
            expect(await migrated.database('oauth2_access_tokens')).toEqual([]);
            expect(await migrated.database('oauth2_refresh_tokens')).toEqual(
                [],
            );
        },
    );
});

test('records the exhausted attempt budget while a guarded job is running', async () => {
    const gate = evidenceGate('compile STARTED log committed');
    gates.push(gate);
    const original = f.schedulerModel.logSchedulerJob.bind(f.schedulerModel);
    vi.spyOn(f.schedulerModel, 'logSchedulerJob').mockImplementation(
        async (log) => {
            await original(log);
            if (log.status === SchedulerJobStatus.STARTED) {
                await gate.pause();
            }
        },
    );
    await f.enqueue('compileProject');
    const [queued] = await f.rows();
    await f.start(['compileProject']);
    try {
        await gate.waitForArrival();
        const [running] = await f.rows();
        expect(running).toMatchObject({
            id: queued.id,
            attempts: 1,
            max_attempts: 1,
            locked_by: expect.stringMatching(/\S/),
            run_at: queued.run_at,
            key: null,
            last_error: null,
        });
        writeSync(
            1,
            `RUNNING_ROW ${JSON.stringify({
                id: String(running.id),
                attempts: running.attempts,
                max_attempts: running.max_attempts,
                locked_by: running.locked_by,
                run_at: running.run_at,
                key: running.key,
            })}\n`,
        );
        await f.refuse('revoked', 'compileProject');
    } finally {
        gate.release();
    }
    await consumed();
    expect(
        (await f.jobModel.get(String(queued.payload.jobUuid))).jobStatus,
    ).toBe(JobStatusType.ERROR);
});

test('retains an exhausted job when a real scheduler ERROR insert fails', async () => {
    await f.enqueue('validateProject');
    const [queued] = await f.rows();
    await f.refuse('revoked', 'validateProject');
    try {
        await migrated.database.raw(
            `CREATE FUNCTION evidence_fail_error_log() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'error' THEN RAISE EXCEPTION 'real ERROR insert failure'; END IF; RETURN NEW; END $$`,
        );
        await migrated.database.raw(
            'CREATE TRIGGER evidence_fail_error_log BEFORE INSERT ON scheduler_log FOR EACH ROW EXECUTE FUNCTION evidence_fail_error_log()',
        );
        await f.start(['validateProject']);
        await vi.waitFor(
            async () => {
                const [failed] = await f.rows();
                expect(failed).toMatchObject({
                    id: queued.id,
                    attempts: 1,
                    max_attempts: 1,
                    locked_by: null,
                    last_error: expect.stringContaining(
                        'real ERROR insert failure',
                    ),
                });
            },
            { timeout: 10000 },
        );
        expect((await f.logs(queued.id)).map((log) => log.status)).toEqual([
            SchedulerJobStatus.SCHEDULED,
        ]);
    } finally {
        try {
            await f.stop();
        } finally {
            try {
                await migrated.database.raw(
                    'DROP TRIGGER IF EXISTS evidence_fail_error_log ON scheduler_log',
                );
            } finally {
                await migrated.database.raw(
                    'DROP FUNCTION IF EXISTS evidence_fail_error_log()',
                );
            }
        }
    }
});

test('retains an exhausted compile when its legacy ERROR write fails at the service call', async () => {
    await f.enqueue('compileProject');
    const [queued] = await f.rows();
    await f.refuse('revoked', 'compileProject');
    vi.spyOn(f.jobModel, 'update').mockRejectedValue(
        new Error('legacy ERROR service failure'),
    );
    await f.start(['compileProject']);
    await vi.waitFor(
        async () =>
            expect(await f.rows()).toEqual([
                expect.objectContaining({
                    id: queued.id,
                    attempts: 1,
                    max_attempts: 1,
                    locked_by: null,
                    last_error: 'legacy ERROR service failure',
                }),
            ]),
        { timeout: 10000 },
    );
    // LIKELY DEFECT: failed bookkeeping leaves the legacy job STARTED after its pending step is skipped.
    expect(
        (await f.jobModel.get(String(queued.payload.jobUuid))).jobStatus,
    ).toBe(JobStatusType.STARTED);
    expect(
        (await f.jobModel.get(String(queued.payload.jobUuid))).steps.map(
            (step) => step.stepStatus,
        ),
    ).toEqual([JobStepStatusType.SKIPPED]);
    expect((await f.logs(queued.id)).map((log) => log.status)).toEqual([
        SchedulerJobStatus.SCHEDULED,
    ]);
});

test('retains a plain runtime exception from a guarded child, failure injected at the service call', async () => {
    await f.enqueue('validateProject');
    const [queued] = await f.rows();
    vi.spyOn(f.validationService, 'generateValidation').mockRejectedValue(
        new Error('runtime service failure'),
    );
    await f.start(['validateProject']);
    await vi.waitFor(
        async () =>
            expect(await f.rows()).toEqual([
                expect.objectContaining({
                    id: queued.id,
                    attempts: 1,
                    max_attempts: 1,
                    locked_by: null,
                    last_error: 'runtime service failure',
                }),
            ]),
        { timeout: 10000 },
    );
    expect((await f.logs(queued.id)).map((log) => log.status)).toEqual([
        SchedulerJobStatus.SCHEDULED,
        SchedulerJobStatus.STARTED,
        SchedulerJobStatus.ERROR,
    ]);
});
