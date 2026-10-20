import {
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    type CreateJob,
    type Job,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    JobsTableName,
    JobStepsTableName,
    type DbJobs,
} from '../../database/entities/jobs';
import { OrganizationMembershipsTableName } from '../../database/entities/organizationMemberships';
import { OrganizationTableName } from '../../database/entities/organizations';
import { UserTableName } from '../../database/entities/users';
import {
    compileShutdown,
    type CompileShutdownContext,
} from '../../scheduler/compileShutdown';
import { JobModel } from './JobModel';

describe('JobModel.findActiveCreateProjectJob', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new JobModel({ database });
    const activeJobRow: DbJobs = {
        job_uuid: 'active-job-uuid',
        project_uuid: undefined,
        user_uuid: 'user-uuid',
        is_preview: false,
        created_at: new Date('2026-08-03T08:30:00.000Z'),
        updated_at: new Date('2026-08-03T08:31:00.000Z'),
        job_status: JobStatusType.RUNNING,
        job_type: JobType.CREATE_PROJECT,
        results: undefined,
    };
    const otherUserActiveJobRow: DbJobs = {
        ...activeJobRow,
        user_uuid: 'other-user-uuid',
    };
    const createJob: CreateJob = {
        jobUuid: activeJobRow.job_uuid,
        projectUuid: undefined,
        userUuid: activeJobRow.user_uuid,
        jobStatus: JobStatusType.STARTED,
        jobType: JobType.CREATE_PROJECT,
        steps: [
            { stepType: JobStepType.TESTING_ADAPTOR },
            { stepType: JobStepType.CREATING_PROJECT },
        ],
    };
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    test('returns the most recent hydrated non-preview create job for the organization', async () => {
        tracker.on.select(JobsTableName).responseOnce(activeJobRow);
        tracker.on.select(JobStepsTableName).responseOnce([]);

        const result = await model.findActiveCreateProjectJob({
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
        });

        expect(result).toEqual<Job>({
            jobUuid: activeJobRow.job_uuid,
            projectUuid: activeJobRow.project_uuid,
            userUuid: activeJobRow.user_uuid,
            createdAt: activeJobRow.created_at,
            updatedAt: activeJobRow.updated_at,
            jobStatus: activeJobRow.job_status,
            jobType: JobType.CREATE_PROJECT,
            jobResults: undefined,
            steps: [],
        });
        const query = tracker.history.select[0];
        expect(query.sql).toContain(`join "${UserTableName}"`);
        expect(query.sql).toContain(
            `join "${OrganizationMembershipsTableName}"`,
        );
        expect(query.sql).toContain(`join "${OrganizationTableName}"`);
        expect(query.sql).toContain(
            `order by "${JobsTableName}"."created_at" desc`,
        );
        expect(query.bindings).toEqual(
            expect.arrayContaining([
                'organization-uuid',
                'user-uuid',
                JobType.CREATE_PROJECT,
                JobStatusType.STARTED,
                JobStatusType.RUNNING,
                false,
            ]),
        );
    });

    test("returns null when the organization's active job belongs to another user", async () => {
        tracker.on.select(JobsTableName).responseOnce(undefined);

        await expect(
            model.findActiveCreateProjectJob({
                organizationUuid: 'organization-uuid',
                userUuid: 'user-uuid',
            }),
        ).resolves.toBeNull();

        expect(tracker.history.select[0].bindings).toEqual(
            expect.arrayContaining(['organization-uuid', 'user-uuid']),
        );
    });

    test('inserts a create job and its steps inside the organization advisory lock', async () => {
        tracker.on.select('pg_advisory_xact_lock').responseOnce({});
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${JobsTableName}"`) &&
                    sql.includes('inner join'),
            )
            .responseOnce(undefined);
        tracker.on.insert(JobsTableName).responseOnce([]);
        tracker.on.insert(JobStepsTableName).response([]);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${JobsTableName}"`) &&
                    !sql.includes('inner join'),
            )
            .responseOnce([activeJobRow]);
        tracker.on.select(JobStepsTableName).responseOnce([]);

        const result = await model.createProjectJobIfNoActive({
            job: createJob,
            organizationUuid: 'organization-uuid',
        });

        expect(result).toMatchObject({
            isCreated: true,
            job: { jobUuid: activeJobRow.job_uuid },
        });
        const lockQuery = tracker.history.select.find(({ sql }) =>
            sql.includes('pg_advisory_xact_lock'),
        );
        expect(lockQuery?.bindings).toEqual([
            'create_project:organization-uuid',
        ]);
        expect(tracker.history.insert).toHaveLength(3);
    });

    test('reports the active job without inserting after taking the lock', async () => {
        tracker.on.select('pg_advisory_xact_lock').responseOnce({});
        tracker.on.select(JobsTableName).responseOnce(otherUserActiveJobRow);
        tracker.on.select(JobStepsTableName).responseOnce([]);

        const result = await model.createProjectJobIfNoActive({
            job: createJob,
            organizationUuid: 'organization-uuid',
        });

        expect(result).toEqual({
            isCreated: false,
            activeJob: expect.objectContaining({
                jobUuid: activeJobRow.job_uuid,
                userUuid: otherUserActiveJobRow.user_uuid,
            }),
        });
        expect(tracker.history.insert).toHaveLength(0);
    });
});

describe('JobModel.failRunningJob', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new JobModel({ database });
    const tracker = getTracker();
    afterEach(() => tracker.reset());

    it.each([JobStatusType.DONE, JobStatusType.ERROR])(
        'leaves a terminal %s job and its steps untouched',
        async (status) => {
            tracker.on.update(JobsTableName).responseOnce(0);
            await model.failRunningJob('leaf_a', 'leaf_b');
            expect(tracker.history.update).toHaveLength(1);
            const query = tracker.history.update[0];
            expect(query.sql).toContain(
                'where "job_uuid" = $3 and "job_status" in ($4, $5)',
            );
            expect(query.bindings.slice(2)).toEqual([
                'leaf_a',
                JobStatusType.RUNNING,
                JobStatusType.STARTED,
            ]);
            expect(query.bindings.slice(3)).not.toContain(status);
        },
    );

    it('guards late compile step and job updates so an interruption stays terminal', async () => {
        const context: CompileShutdownContext = {
            controller: new AbortController(),
            jobUuid: 'leaf_a',
            armed: true,
            isStopping: () => true,
            interrupt: vi.fn(),
        };
        tracker.on.update(JobsTableName).response(0);
        tracker.on.update(JobStepsTableName).response(0);
        await compileShutdown.run(context, async () => {
            await model.updateJobStep(
                'leaf_a',
                JobStepStatusType.DONE,
                JobStepType.COMPILING,
            );
            await model.update('leaf_a', { jobStatus: JobStatusType.DONE });
            await model.startJobStep('leaf_a', JobStepType.COMPILING);
        });
        const [step, jobStepUpdate, jobUpdate, startStep] =
            tracker.history.update;
        expect(startStep.sql).toContain('and "step_status" =');
        expect(startStep.bindings.at(-1)).toBe(JobStepStatusType.PENDING);
        const jobs = [jobStepUpdate, jobUpdate];
        expect(step.sql).toContain('and "step_status" =');
        expect(step.bindings.at(-1)).toBe(JobStepStatusType.RUNNING);
        expect(jobs).toHaveLength(2);
        for (const query of jobs) {
            expect(query.sql).toContain('and "job_status" in');
            expect(query.bindings.slice(-2)).toEqual([
                JobStatusType.RUNNING,
                JobStatusType.STARTED,
            ]);
        }
    });

    it('changes only active jobs and running or pending steps', async () => {
        tracker.on.update(JobsTableName).responseOnce(1);
        tracker.on.update(JobStepsTableName).response(1);
        await model.failRunningJob('leaf_a', 'leaf_b');
        const updates = tracker.history.update;
        expect(updates).toHaveLength(3);
        expect(updates[1].sql).toContain('and "step_status" =');
        expect(updates[1].bindings).toEqual([
            JobStepStatusType.ERROR,
            'leaf_b',
            expect.any(Date),
            'leaf_a',
            JobStepStatusType.RUNNING,
        ]);
        expect(updates[2].bindings).toEqual([
            JobStepStatusType.SKIPPED,
            expect.any(Date),
            'leaf_a',
            JobStepStatusType.PENDING,
        ]);
    });
    it.each(['absent', 'unarmed'] as const)(
        'keeps the original update SQL with an %s context',
        async (mode) => {
            tracker.on.update(JobsTableName).response(1);
            tracker.on.update(JobStepsTableName).response(1);
            const update = async () => {
                await model.update('leaf_a', { jobStatus: JobStatusType.DONE });
                await model.startJobStep('leaf_a', JobStepType.COMPILING);
                await model.updateJobStep(
                    'leaf_a',
                    JobStepStatusType.DONE,
                    JobStepType.COMPILING,
                );
            };
            if (mode === 'absent') await update();
            else {
                const controller = new AbortController();
                controller.abort(new Error('leaf_b'));
                await compileShutdown.run(
                    {
                        controller,
                        jobUuid: 'leaf_a',
                        armed: false,
                        isStopping: () => true,
                        interrupt: vi.fn(),
                    },
                    update,
                );
            }
            expect(tracker.history.update).toHaveLength(4);
            for (const query of tracker.history.update) {
                const where = query.sql.slice(query.sql.indexOf(' where '));
                expect(where).not.toMatch(/"job_status" in|"step_status" =/);
            }
        },
    );
});
