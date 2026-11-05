import { ForbiddenError } from '@lightdash/common';
import { getDailyDatesFromCron } from './SchedulerClient';
import { SchedulerWorker } from './SchedulerWorker';

describe('Cron converter', () => {
    test('Should convert cron into daily dates', () => {
        const when = new Date(2023, 0, 1); // Beggining of the day
        const executionDates = getDailyDatesFromCron(
            {
                cron: '0 * * * *', // Every hour
                timezone: 'UTC',
            },
            when,
        );

        expect(executionDates.length).toStrictEqual(24);
    });

    test('Should convert cron into daily dates with timezone', () => {
        const when = new Date(2023, 0, 1);
        const timezone = 'Europe/Paris';
        const executionDates = getDailyDatesFromCron(
            {
                cron: '0 18 * * *',
                timezone,
            },
            when,
        );

        expect(
            executionDates.map((d) =>
                d.toLocaleString('en-GB', { timeZone: 'Europe/Paris' }),
            ),
        ).toStrictEqual(['01/01/2023, 18:00:00']); // 6PM in Europe.paris time
    });

    test('Make sure we can schedule at midnight', () => {
        const when = new Date(2023, 0, 1, 0, 0, 30); // Beggining of the day (30 seconds after midnight)
        const executionDates = getDailyDatesFromCron(
            { cron: '0 * * * *', timezone: 'UTC' }, // Every hour
            when,
        );

        expect(executionDates[0]).toStrictEqual(new Date(2023, 0, 1, 0, 0, 0)); // First execution should be at midnight
    });

    test('Make sure we can schedule at midnight by passing the start of the day', () => {
        const when = new Date(2023, 0, 1, 0, 0, 0);
        const executionDates = getDailyDatesFromCron(
            { cron: '0 * * * *', timezone: 'UTC' }, // Every hour
            when,
        );

        expect(executionDates[0]).toStrictEqual(new Date(2023, 0, 1, 0, 0, 0)); // First execution should be at midnight
    });

    test('When no start time is provided, it should generate jobs after now', () => {
        // A minute and a half after midnight
        const when = new Date(2023, 0, 1, 0, 1, 30);
        const executionDates = getDailyDatesFromCron(
            { cron: '0 0 * * *', timezone: 'UTC' }, // At midnight
            when,
        );

        // We should not generate jobs for today
        expect(executionDates.length).toStrictEqual(0);
    });

    test('Beginning and end of workday', () => {
        const when = new Date(2023, 0, 1, 0, 0, 30); // Beggining of the day (30 seconds after midnight)
        const executionDates = getDailyDatesFromCron(
            { cron: '30 9,18 * * *', timezone: 'UTC' }, // at 9:30 and 18:30
            when,
        );

        expect(executionDates).toStrictEqual([
            new Date(2023, 0, 1, 9, 30, 0),
            new Date(2023, 0, 1, 18, 30, 0),
        ]);
    });

    test('Get empty dates if scheduled on a different day', () => {
        const when = new Date(2023, 0, 1); // Beggining of the day
        const executionDates = getDailyDatesFromCron(
            { cron: '0 * 30 * *', timezone: 'UTC' }, // every 30th day of the month
            when,
        );

        expect(executionDates).toStrictEqual([]);
    });

    test('Get a date at the end of the day', () => {
        const executionDates = getDailyDatesFromCron({
            cron: '59 23 * * *',
            timezone: 'UTC',
        }); // at 23:59

        expect(executionDates.length).toStrictEqual(1);
        expect(executionDates[0].toISOString().split('T')[1]).toStrictEqual(
            '23:59:00.000Z',
        );
    });
});

describe('connection jobs at the Graphile dispatch boundary', () => {
    test.each([
        'compileProject',
        'validateProject',
        'replaceCustomFields',
        'materializePreAggregate',
    ] as const)(
        '%s stops a refused serialized job without a session fallback',
        async (taskName) => {
            const effect = vi.fn();
            const session = vi.fn();
            const validate = vi
                .fn()
                .mockRejectedValue(new ForbiddenError('connection revoked'));
            const worker = new SchedulerWorker({
                lightdashConfig: { scheduler: { tasks: [] } },
                getAgentConnectionGrantService: () => ({
                    assertActiveExecution: validate,
                }),
                schedulerService: { logSchedulerJob: vi.fn() },
                projectService: {
                    compileProject: effect,
                    replaceCustomFields: effect,
                    _markJobAsFailed: vi.fn(),
                },
                userService: {
                    getSessionByUserUuid: session,
                    getAccountByUserUuid: session,
                },
                catalogService: { indexCatalog: effect },
                validationService: { generateValidation: effect },
                preAggregateMaterializationService: {
                    materializePreAggregate: effect,
                },
            } as unknown as ConstructorParameters<typeof SchedulerWorker>[0]);
            const tasks = (
                worker as unknown as {
                    getFullTaskList(): Record<
                        string,
                        (payload: unknown, helpers: unknown) => Promise<void>
                    >;
                }
            ).getFullTaskList();
            const payload = {
                userUuid: 'user',
                createdByUserUuid: 'user',
                organizationUuid: 'org',
                projectUuid: '11111111-1111-4111-8111-111111111111',
                jobUuid: 'compile-job',
                agentConnectionEffect: taskName,
                agentConnectionExecution: {
                    grantUuid: 'grant',
                    revision: 1,
                    subjectUserUuid: 'user',
                    organizationUuid: 'org',
                    clientId: 'lightdash-cli',
                    resource: 'https://example.com',
                    refreshFamilyUuid: 'family',
                    scopes: ['read', 'write'],
                    operation: {
                        kind: 'rest',
                        key: 'ProjectController.refresh',
                    },
                },
            };
            await expect(
                tasks[taskName](structuredClone(payload), {
                    job: { id: 'job', run_at: new Date() },
                }),
            ).resolves.toBeUndefined();
            expect(validate).toHaveBeenCalledOnce();
            expect(effect).not.toHaveBeenCalled();
            expect(session).not.toHaveBeenCalled();
        },
    );
});
