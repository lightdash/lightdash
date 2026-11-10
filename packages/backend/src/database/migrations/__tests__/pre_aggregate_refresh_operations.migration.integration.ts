import {
    ForbiddenError,
    SchedulerJobStatus,
    UnexpectedServerError,
    type Explore,
} from '@lightdash/common';
import SchedulerTask from '../../../scheduler/SchedulerTask';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
import { validExplore } from '../../../services/ProjectService/ProjectService.mock';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { seedConnectionClient } from './agentConnectionFixture.mock';
import { measure } from './launch-measurements/metrics';
import { projectHooks } from './launch-measurements/projectHooks';
import {
    refreshFixture,
    refreshOperation,
    refreshSchedulerHooks,
} from './preAggregateRefresh.mock';

vi.mock('../../../config/lightdashConfig', async () => {
    const { lightdashConfigMock } =
        await import('../../../config/lightdashConfig.mock');
    return { lightdashConfig: lightdashConfigMock };
});
let migrated: MigratedDatabase;
beforeAll(async () => {
    migrated = await createMigratedDatabase();
    await seedConnectionClient(migrated.database);
});
afterAll(async () => migrated?.destroy());
afterEach(() => vi.restoreAllMocks());
const operations = [
    'schedule',
    'compile',
    'deploy',
    'array',
    'retained',
    'start',
    'batch',
    'finalize',
    'parameters',
    'virtual-create',
    'virtual-update',
    'stream',
    'refresh',
];
const incomingOperations = [
    'compile',
    'deploy',
    'array',
    'retained',
    'batch',
    'finalize',
    'stream',
    'refresh',
];
const expectedReads: Record<string, number> = {
    schedule: 1,
    compile: 7,
    deploy: 2,
    array: 2,
    retained: 1,
    start: 1,
    batch: 1,
    finalize: 3,
    parameters: 2,
    'virtual-create': 2,
    'virtual-update': 2,
    stream: 3,
    refresh: 1,
};
const captureOutcome = async (run: () => Promise<unknown>) => {
    try {
        await run();
        return null;
    } catch (error) {
        return error as Error;
    }
};
const data = async (projectUuid: string) =>
    Promise.all(
        [
            'cached_explore',
            'project_parameters',
            'deploy_sessions',
            'deploy_session_batch_explores',
        ].map((table) =>
            migrated
                .database(table)
                .where('project_uuid', projectUuid)
                .orderByRaw('1'),
        ),
    );

describe.each(operations)('%s', (operation) => {
    test.each(
        [false, true].flatMap((stored) =>
            [false, true].map((incoming) => ({ stored, incoming })),
        ),
    )(
        'same outcome and refusal boundary stored=$stored incoming=$incoming',
        async ({ stored, incoming }) => {
            const outcomes: (Error | null)[] = [];
            const effects: number[][] = [];
            for await (const reference of [true, false]) {
                const f = await refreshFixture(migrated.database);
                const inputs = [incoming ? f.withCron('') : validExplore];
                const op = await refreshOperation(f, operation, inputs);
                await f.projects.saveExploresToCache(
                    f.projectUuid,
                    [
                        stored
                            ? { ...f.withCron(''), name: 'stored' }
                            : { ...validExplore, name: 'stored' },
                    ],
                    false,
                );
                if (reference)
                    vi.spyOn(
                        f.service,
                        'assertConnectionPreAggregateRefresh',
                    ).mockImplementation((id, explores) =>
                        f.reference.assertConnectionPreAggregateRefresh(
                            id,
                            explores,
                        ),
                    );
                const before = await data(f.projectUuid);
                const result = await agentExecutionContext.run(f.scope, () =>
                    captureOutcome(op.run),
                );
                const refused =
                    stored ||
                    (incoming && incomingOperations.includes(operation));
                if (refused) {
                    expect(result).toBeInstanceOf(ForbiddenError);
                    expect(await data(f.projectUuid)).toEqual(before);
                    expect(op.sink).not.toHaveBeenCalled();
                    expect(f.jobs.create).not.toHaveBeenCalled();
                    expect(f.scheduler.compileProject).not.toHaveBeenCalled();
                } else expect(result).toBeNull();
                outcomes.push(result);
                effects.push([
                    op.sink.mock.calls.length,
                    f.jobs.create.mock.calls.length,
                    f.scheduler.compileProject.mock.calls.length,
                    f.scheduler.generateValidation.mock.calls.length,
                ]);
                vi.restoreAllMocks();
            }
            expect(outcomes[1]?.constructor).toBe(outcomes[0]?.constructor);
            expect(outcomes[1]?.message).toBe(outcomes[0]?.message);
            expect(effects[1]).toEqual(effects[0]);
        },
    );

    test.each(
        incomingOperations.includes(operation)
            ? ['stored', 'incoming']
            : ['stored'],
    )('malformed %s stops before mutation', async (location) => {
        const f = await refreshFixture(migrated.database);
        const malformed = {
            ...validExplore,
            preAggregates: {},
        } as unknown as Explore;
        const inputs = [location === 'incoming' ? malformed : validExplore];
        const op = await refreshOperation(f, operation, inputs);
        await f.projects.saveExploresToCache(
            f.projectUuid,
            [
                {
                    ...(location === 'stored' ? malformed : validExplore),
                    name: 'stored',
                },
            ],
            false,
        );
        const before = await data(f.projectUuid);
        const prior = await agentExecutionContext.run(f.scope, () =>
            captureOutcome(() =>
                f.reference.assertConnectionPreAggregateRefresh(
                    f.projectUuid,
                    incomingOperations.includes(operation) ? inputs : [],
                ),
            ),
        );
        expect(prior).toBeInstanceOf(TypeError);
        const actual = await agentExecutionContext.run(f.scope, () =>
            captureOutcome(op.run),
        );
        expect(actual).toBeInstanceOf(UnexpectedServerError);
        expect(actual?.message).toBe(
            'Explores for this project have an invalid pre-aggregate definition.',
        );
        expect(await data(f.projectUuid)).toEqual(before);
        expect(op.sink).not.toHaveBeenCalled();
        expect(f.jobs.create).not.toHaveBeenCalled();
        expect(f.scheduler.compileProject).not.toHaveBeenCalled();
    });

    test.each([false, true])(
        'guard SQL only for connection=%s',
        async (connection) => {
            const f = await refreshFixture(migrated.database);
            const op = await refreshOperation(f, operation, [validExplore]);
            await f.projects.saveExploresToCache(
                f.projectUuid,
                [{ ...validExplore, name: 'stored' }],
                false,
            );
            const scope = connection
                ? f.scope
                : { ...f.scope, claim: null, agentConnectionExecution: null };
            const measured = await measure(migrated.database, () =>
                agentExecutionContext.run(scope, op.run),
            );
            const statements = Object.entries(measured.sample.sql);
            const guards = statements.filter(([sql]) =>
                sql.includes('"hasMalformedPreAggregates"'),
            );
            expect(guards.reduce((sum, [, row]) => sum + row.count, 0)).toBe(
                connection ? expectedReads[operation] : 0,
            );
            expect(
                statements.some(([sql]) =>
                    /^select "explore", "cached_explore_uuid" from "cached_explore" where "project_uuid" = \?$/.test(
                        sql,
                    ),
                ),
            ).toBe(false);
            expect(
                statements.some(([sql]) =>
                    /select \* from "pre_aggregate_definitions"/.test(sql),
                ),
            ).toBe(false);
        },
    );
});

test.each(
    [false, true].flatMap((connection) =>
        [false, true].map((stored) => ({ connection, stored })),
    ),
)(
    'scheduler wrapper refuses before STARTED, connection=$connection stored=$stored',
    async ({ connection, stored }) => {
        const f = await refreshFixture(migrated.database);
        await refreshOperation(f, 'compile', [validExplore]);
        await f.save([stored ? f.withCron('') : validExplore]);
        const log = vi.fn().mockResolvedValue(undefined);
        const task: SchedulerTask = Object.assign(
            Object.create(SchedulerTask.prototype),
            {
                projectService: f.service,
                getAgentConnectionGrantService: () => ({
                    assertActiveExecution: async () => ({
                        account: f.account,
                        scope: f.scope,
                    }),
                }),
                schedulerService: { logSchedulerJob: log },
                schedulerClient: f.scheduler,
                userService: { getSessionByUserUuid: async () => f.user },
            },
        );
        const measured = await measure(migrated.database, () =>
            refreshSchedulerHooks(task).compileProject(
                'scheduler-job',
                new Date(),
                {
                    projectUuid: f.projectUuid,
                    userUuid: f.userUuid,
                    createdByUserUuid: f.userUuid,
                    organizationUuid: f.organizationUuid,
                    jobUuid: 'compile-job',
                    requestMethod: 'cli',
                    isPreview: false,
                    agentConnectionExecution: connection
                        ? f.scope.agentConnectionExecution!
                        : null,
                    agentConnectionEffect: connection
                        ? 'compileProject'
                        : undefined,
                },
            ),
        );
        const reads = Object.entries(measured.sample.sql)
            .filter(([sql]) => sql.includes('"hasMalformedPreAggregates"'))
            .reduce((sum, [, row]) => sum + row.count, 0);
        const executionReads = stored ? 1 : 8;
        expect(reads).toBe(connection ? executionReads : 0);
        if (connection && stored) {
            expect(log).not.toHaveBeenCalledWith(
                expect.objectContaining({ status: SchedulerJobStatus.STARTED }),
            );
            expect(log).toHaveBeenCalledWith(
                expect.objectContaining({ status: SchedulerJobStatus.ERROR }),
            );
        } else
            expect(log).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: SchedulerJobStatus.COMPLETED,
                }),
            );
    },
);

test('the save rechecks storage and reuses the already checked stream without consuming it twice', async () => {
    const f = await refreshFixture(migrated.database);
    let produced = 0;
    const source = (async function* incoming() {
        produced += 1;
        yield validExplore;
    })();
    const first = await agentExecutionContext.run(f.scope, () =>
        projectHooks(f.service).prepareConnectionExploreStream(
            f.projectUuid,
            source,
        ),
    );
    expect(produced).toBe(1);
    const next = vi.spyOn(first[Symbol.asyncIterator](), 'next');
    const second = await agentExecutionContext.run(f.scope, () =>
        projectHooks(f.service).prepareConnectionExploreStream(
            f.projectUuid,
            first,
        ),
    );
    expect(second).toBe(first);
    expect(next).not.toHaveBeenCalled();
    await f.save([f.withCron('')]);
    await expect(
        agentExecutionContext.run(f.scope, () =>
            projectHooks(f.service).prepareConnectionExploreStream(
                f.projectUuid,
                first,
            ),
        ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(next).not.toHaveBeenCalled();
});
