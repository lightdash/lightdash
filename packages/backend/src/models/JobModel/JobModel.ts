import {
    BaseJob,
    CreateJob,
    Job,
    JobLabels,
    JobStatusType,
    JobStep,
    JobStepStatusType,
    JobStepType,
    LightdashError,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DbJobs,
    JobsTableName,
    JobStepsTableName,
} from '../../database/entities/jobs';

type JobModelDependencies = {
    database: Knex;
};

export class JobModel {
    private database: Knex;

    constructor(deps: JobModelDependencies) {
        this.database = deps.database;
    }

    async get(jobUuid: string): Promise<Job> {
        const [row] = await this.database(JobsTableName).where(
            'job_uuid',
            jobUuid,
        );
        if (row === undefined)
            throw new NotFoundError(
                `job with jobUuid ${jobUuid} does not exist`,
            );

        return this.convertRowToJob(row);
    }

    async convertRowToJob(row: DbJobs): Promise<Job> {
        const steps = await this.getSteps(row.job_uuid);
        const baseJob: BaseJob = {
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            projectUuid: row.project_uuid,
            userUuid: row.user_uuid,
            jobUuid: row.job_uuid,
            jobStatus: row.job_status,
            steps,
        };
        const job: Job = {
            ...baseJob,
            jobType: row.job_type,
            jobResults: row.results,
        } as Job; // be lazy instead of enumerating all job type-results pairs (see common/types/job.ts)
        return job;
    }

    async getSteps(jobUuid: string): Promise<JobStep[]> {
        const steps = await this.database(JobStepsTableName)
            .where('job_uuid', jobUuid)
            .orderBy('step_id', 'asc');

        return steps.map((step) => {
            const stepType: JobStepType = step.step_type;
            const stepLabel: string = JobLabels[stepType];
            return {
                jobUuid: step.job_uuid,
                createdAt: step.created_at,
                updatedAt: step.updated_at,
                stepStatus: step.step_status,
                stepType,
                stepError: step.step_error,
                stepLabel,
                startedAt: step.started_at,
            };
        });
    }

    async update(
        jobUuid: string,
        job: Partial<Pick<Job, 'jobStatus' | 'jobType' | 'jobResults'>>,
    ): Promise<void> {
        await this.database(JobsTableName)
            .update({
                ...(job.jobStatus !== undefined
                    ? { job_status: job.jobStatus }
                    : {}),
                ...(job.jobType !== undefined ? { job_type: job.jobType } : {}),
                ...(job.jobResults !== undefined
                    ? { results: job.jobResults }
                    : {}),
            })
            .where('job_uuid', jobUuid);
    }

    async create(job: CreateJob): Promise<Job> {
        await this.database.transaction(async (trx) => {
            await trx(JobsTableName)
                .insert({
                    project_uuid: job.projectUuid,
                    user_uuid: job.userUuid,
                    job_uuid: job.jobUuid,
                    job_type: job.jobType,
                    job_status: job.jobStatus,
                })
                .returning('*');
            await job.steps.reduce(async (previousPromise, step) => {
                await previousPromise;
                return trx(JobStepsTableName).insert({
                    job_uuid: job.jobUuid,
                    step_status: JobStepStatusType.PENDING,
                    step_type: step.stepType,
                });
            }, Promise.resolve());
        });
        return this.get(job.jobUuid);
    }

    async startJobStep(jobUuid: string, stepType: JobStepType): Promise<void> {
        await this.database(JobStepsTableName)
            .update({
                step_status: JobStepStatusType.RUNNING,
                started_at: new Date(),
            })
            .where('job_uuid', jobUuid)
            .andWhere('step_type', stepType);
    }

    async updateJobStep(
        jobUuid: string,
        stepStatus: JobStepStatusType,
        stepType: JobStepType,
        stepError?: string,
    ): Promise<void> {
        await this.database(JobStepsTableName)
            .update({
                step_status: stepStatus,
                updated_at: new Date(),
                step_error: stepError,
            })
            .where('job_uuid', jobUuid)
            .andWhere('step_type', stepType);

        await this.database(JobsTableName)
            .update({
                updated_at: new Date(),
                job_status:
                    stepStatus === JobStepStatusType.ERROR
                        ? JobStatusType.ERROR
                        : JobStatusType.RUNNING,
            })
            .where('job_uuid', jobUuid);
    }

    async setPendingJobsToSkipped(jobUuid: string): Promise<void> {
        await this.database(JobStepsTableName)
            .update({
                step_status: JobStepStatusType.SKIPPED,
                updated_at: new Date(),
            })
            .where('job_uuid', jobUuid)
            .andWhere('step_status', JobStepStatusType.PENDING);
    }

    async tryJobStep<T>(
        jobUuid: string,
        jobStepType: JobStepType,
        callback: () => Promise<T>,
    ): Promise<T> {
        try {
            await this.startJobStep(jobUuid, jobStepType);

            const result = await callback();

            await this.updateJobStep(
                jobUuid,
                JobStepStatusType.DONE,
                jobStepType,
            );
            return result;
        } catch (e: any) {
            const formatJobErrorMessage = (error: unknown) => {
                if (error instanceof LightdashError) {
                    return `${error.name}: ${error.message}${
                        Object.keys(error.data).length > 0
                            ? ` \n${JSON.stringify(error.data)}`
                            : ''
                    }`;
                }
                return `${error}`;
            };
            await this.updateJobStep(
                jobUuid,
                JobStepStatusType.ERROR,
                jobStepType,
                formatJobErrorMessage(e),
            );
            await this.update(jobUuid, { jobStatus: JobStatusType.ERROR });
            throw e; // throw the error again
        }
    }
}
