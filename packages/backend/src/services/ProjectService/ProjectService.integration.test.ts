import {
    ConflictError,
    DbtProjectType,
    DbtVersionOptionLatest,
    JobStatusType,
    JobType,
    ProjectType,
    RequestMethod,
    WarehouseTypes,
    type CreateProject,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
import { JobsTableName } from '../../database/entities/jobs';
import { getServices, getTestContext } from '../../vitest.setup.integration';

describe('ProjectService create project scheduling', () => {
    const createProject: CreateProject = {
        name: 'Integration test project',
        type: ProjectType.DEFAULT,
        dbtConnection: { type: DbtProjectType.NONE },
        dbtVersion: DbtVersionOptionLatest.LATEST,
        warehouseConnection: {
            type: WarehouseTypes.POSTGRES,
            host: 'localhost',
            port: 5432,
            user: 'postgres',
            password: 'password',
            dbname: 'postgres',
            schema: 'public',
        },
    };

    const deleteCreateProjectJobs = async () => {
        const { db, testUser } = getTestContext();
        await db(JobsTableName)
            .where('user_uuid', testUser.userUuid)
            .where('job_type', JobType.CREATE_PROJECT)
            .where('is_preview', false)
            .delete();
    };

    beforeEach(deleteCreateProjectJobs);

    afterEach(async () => {
        vi.restoreAllMocks();
        await deleteCreateProjectJobs();
    });

    test('recovers from an enqueue failure without leaving a zombie lockout', async () => {
        const { app, testUser } = getTestContext();
        const { projectService } = getServices(app);
        vi.spyOn(projectService.schedulerClient, 'createProjectWithCompile')
            .mockRejectedValueOnce(new Error('enqueue failed'))
            .mockResolvedValue({ jobId: 'scheduler-job-id' });

        await expect(
            projectService.scheduleCreate(
                testUser,
                createProject,
                RequestMethod.WEB_APP,
            ),
        ).rejects.toThrow('enqueue failed');

        const [deadJob] = await getTestContext()
            .db(JobsTableName)
            .where('user_uuid', testUser.userUuid)
            .where('job_type', JobType.CREATE_PROJECT)
            .select('job_uuid', 'job_status');
        const recovery =
            await projectService.getActiveCreateProjectJob(testUser);
        const retry = await projectService
            .scheduleCreate(testUser, createProject, RequestMethod.WEB_APP)
            .then(
                () => ({ outcome: 'succeeded' as const }),
                (error: unknown) => ({ outcome: 'failed' as const, error }),
            );

        expect({
            failedJobStatus: deadJob.job_status,
            recoveryJobUuid: recovery?.jobUuid ?? null,
            retryOutcome: retry.outcome,
            retryStatusCode:
                retry.outcome === 'failed' &&
                retry.error instanceof ConflictError
                    ? retry.error.statusCode
                    : null,
        }).toEqual({
            failedJobStatus: JobStatusType.ERROR,
            recoveryJobUuid: null,
            retryOutcome: 'succeeded',
            retryStatusCode: null,
        });
    });

    test('rejects a duplicate while an old create job is still running', async () => {
        const { app, db, testUser } = getTestContext();
        const { projectService } = getServices(app);
        const oldJobUuid = randomUUID();
        await db(JobsTableName).insert({
            job_uuid: oldJobUuid,
            project_uuid: undefined,
            user_uuid: testUser.userUuid,
            is_preview: false,
            job_status: JobStatusType.RUNNING,
            job_type: JobType.CREATE_PROJECT,
        });
        await db.raw(
            'UPDATE ?? SET created_at = ?, updated_at = ? WHERE job_uuid = ?',
            [
                JobsTableName,
                new Date(Date.now() - 2 * 60 * 60 * 1000),
                new Date(),
                oldJobUuid,
            ],
        );
        const enqueue = vi
            .spyOn(projectService.schedulerClient, 'createProjectWithCompile')
            .mockResolvedValue({ jobId: 'scheduler-job-id' });

        const error = await projectService
            .scheduleCreate(testUser, createProject, RequestMethod.WEB_APP)
            .catch((caughtError: unknown) => caughtError);

        expect(error).toBeInstanceOf(ConflictError);
        expect(error).toMatchObject({
            statusCode: 409,
            data: { jobUuid: oldJobUuid },
        });
        expect(enqueue).not.toHaveBeenCalled();
    });

    test('reaps a stale create job with no backing scheduler job', async () => {
        const { app, db, testUser } = getTestContext();
        const { projectService } = getServices(app);
        const staleJobUuid = randomUUID();
        await db(JobsTableName).insert({
            job_uuid: staleJobUuid,
            project_uuid: undefined,
            user_uuid: testUser.userUuid,
            is_preview: false,
            job_status: JobStatusType.STARTED,
            job_type: JobType.CREATE_PROJECT,
        });
        const staleAt = new Date(Date.now() - 20 * 60 * 1000);
        await db.raw(
            'UPDATE ?? SET created_at = ?, updated_at = ? WHERE job_uuid = ?',
            [JobsTableName, staleAt, staleAt, staleJobUuid],
        );
        vi.spyOn(
            projectService.schedulerClient,
            'createProjectWithCompile',
        ).mockResolvedValue({ jobId: 'scheduler-job-id' });

        const recovery =
            await projectService.getActiveCreateProjectJob(testUser);
        const retry = await projectService
            .scheduleCreate(testUser, createProject, RequestMethod.WEB_APP)
            .then(
                () => ({ outcome: 'succeeded' as const }),
                (error: unknown) => ({ outcome: 'failed' as const, error }),
            );
        const [staleJob] = await db(JobsTableName)
            .where('job_uuid', staleJobUuid)
            .select('job_status');

        expect({
            recoveryJobUuid: recovery?.jobUuid ?? null,
            retryOutcome: retry.outcome,
            staleJobStatus: staleJob.job_status,
        }).toEqual({
            recoveryJobUuid: null,
            retryOutcome: 'succeeded',
            staleJobStatus: JobStatusType.ERROR,
        });
    });

    test('preserves a stale create job with a backing scheduler job', async () => {
        const { app, db, testUser } = getTestContext();
        const { projectService } = getServices(app);
        const liveJobUuid = randomUUID();
        await db(JobsTableName).insert({
            job_uuid: liveJobUuid,
            project_uuid: undefined,
            user_uuid: testUser.userUuid,
            is_preview: false,
            job_status: JobStatusType.RUNNING,
            job_type: JobType.CREATE_PROJECT,
        });
        const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
        await db.raw(
            'UPDATE ?? SET created_at = ?, updated_at = ? WHERE job_uuid = ?',
            [JobsTableName, staleAt, staleAt, liveJobUuid],
        );
        const hasSchedulerJob = vi
            .spyOn(
                projectService.schedulerClient,
                'hasCreateProjectWithCompileJob',
            )
            .mockResolvedValue(true);

        const recovery =
            await projectService.getActiveCreateProjectJob(testUser);
        const [liveJob] = await db(JobsTableName)
            .where('job_uuid', liveJobUuid)
            .select('job_status');

        expect(recovery).toMatchObject({ jobUuid: liveJobUuid });
        expect(liveJob.job_status).toBe(JobStatusType.RUNNING);
        expect(hasSchedulerJob).toHaveBeenCalledWith(liveJobUuid);
    });

    test('serializes concurrent creates for the same organization', async () => {
        const { app, db, testUser } = getTestContext();
        const { projectService } = getServices(app);
        const enqueue = vi
            .spyOn(projectService.schedulerClient, 'createProjectWithCompile')
            .mockResolvedValue({ jobId: 'scheduler-job-id' });

        const results = await Promise.allSettled([
            projectService.scheduleCreate(
                testUser,
                createProject,
                RequestMethod.WEB_APP,
            ),
            projectService.scheduleCreate(
                testUser,
                createProject,
                RequestMethod.WEB_APP,
            ),
        ]);
        const fulfilled = results.filter(
            (result) => result.status === 'fulfilled',
        );
        const rejected = results.filter(
            (result) => result.status === 'rejected',
        );
        const rows = await db(JobsTableName)
            .where('user_uuid', testUser.userUuid)
            .where('job_type', JobType.CREATE_PROJECT)
            .where('is_preview', false);

        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]).toMatchObject({
            reason: { statusCode: 409 },
        });
        expect(rows).toHaveLength(1);
        expect(enqueue).toHaveBeenCalledOnce();
    });

    test('does not recover a recently completed create job', async () => {
        const { app, db, testProjectUuid, testUser } = getTestContext();
        const { projectService } = getServices(app);
        const jobUuid = randomUUID();
        const projectUuid = testProjectUuid;
        await db(JobsTableName).insert({
            job_uuid: jobUuid,
            project_uuid: projectUuid,
            user_uuid: testUser.userUuid,
            is_preview: false,
            job_status: JobStatusType.DONE,
            job_type: JobType.CREATE_PROJECT,
        });
        await db(JobsTableName).where('job_uuid', jobUuid).update({
            results: { projectUuid },
        });
        await db.raw(
            'UPDATE ?? SET created_at = ?, updated_at = ? WHERE job_uuid = ?',
            [
                JobsTableName,
                new Date(Date.now() - 2 * 60 * 60 * 1000),
                new Date(),
                jobUuid,
            ],
        );

        const recovery =
            await projectService.getActiveCreateProjectJob(testUser);

        expect(recovery).toBeNull();
    });
});
