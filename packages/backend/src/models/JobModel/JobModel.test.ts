import {
    JobStatusType,
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
import { JobModel } from './JobModel';

describe('JobModel.findActiveCreateProjectJob', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new JobModel({ database });
    const createdAfter = new Date('2026-08-03T08:00:00.000Z');
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
            createdAfter,
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
                JobType.CREATE_PROJECT,
                JobStatusType.STARTED,
                JobStatusType.RUNNING,
                false,
                createdAfter,
            ]),
        );
    });

    test('returns null when no recent active non-preview create job exists', async () => {
        tracker.on.select(JobsTableName).responseOnce(undefined);

        await expect(
            model.findActiveCreateProjectJob({
                organizationUuid: 'organization-uuid',
                createdAfter,
            }),
        ).resolves.toBeNull();
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
            createdAfter,
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
        tracker.on.select(JobsTableName).responseOnce(activeJobRow);
        tracker.on.select(JobStepsTableName).responseOnce([]);

        const result = await model.createProjectJobIfNoActive({
            job: createJob,
            organizationUuid: 'organization-uuid',
            createdAfter,
        });

        expect(result).toEqual({
            isCreated: false,
            activeJob: expect.objectContaining({
                jobUuid: activeJobRow.job_uuid,
            }),
        });
        expect(tracker.history.insert).toHaveLength(0);
    });
});
