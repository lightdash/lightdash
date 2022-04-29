import {
    Job,
    JobLabels,
    JobStatusType,
    JobStep,
    JobStepStatusType,
    JobStepType,
} from 'common';
import { Knex } from 'knex';
import { JobsTableName, JobStepsTableName } from '../../database/entities/jobs';
import { NotFoundError } from '../../errors';
import Logger from '../../logger';
import Transaction = Knex.Transaction;

type JobModelDependencies = {
    database: Knex;
};

export class JobModel {
    private database: Knex;

    constructor(deps: JobModelDependencies) {
        this.database = deps.database;
    }

    async getMostRecentJobByProject(
        projectUuid: string,
    ): Promise<Job | undefined> {
        const jobs = await this.database(JobsTableName)
            .where('project_uuid', projectUuid)
            .orderBy('updated_at', 'desc')
            .limit(1);

        if (jobs.length === 0) return undefined;

        const job = jobs[0];
        const steps = await this.getSteps(job.job_uuid);

        return {
            createdAt: job.created_at,
            updatedAt: job.updated_at,
            projectUuid: job.project_uuid,
            jobUuid: job.job_uuid,
            jobStatus: job.job_status,
            steps,
        };
    }

    async getJobstatus(jobUuid: string): Promise<Job> {
        const jobs = await this.database(JobsTableName).where(
            'job_uuid',
            jobUuid,
        );

        if (jobs.length === 0)
            throw new NotFoundError(
                `job with jobUuid ${jobUuid} does not exist`,
            );

        const job = jobs[0];
        const steps = await this.getSteps(jobUuid);
        return {
            createdAt: job.created_at,
            updatedAt: job.updated_at,
            projectUuid: job.project_uuid,
            jobUuid: job.job_uuid,
            jobStatus: job.job_status,
            steps,
        };
    }

    async getSteps(jobUuid: string): Promise<JobStep[]> {
        const steps = await this.database(JobStepsTableName)
            .where('job_uuid', jobUuid)
            .orderBy('step_id', 'desc');

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
            };
        });
    }

    async upsertJobStatus(
        jobUuid: string,
        projectUuid: string | undefined,
        status: JobStatusType,
    ): Promise<void> {
        Logger.debug(
            `Updating job status ${jobUuid} for project ${projectUuid} with status ${status}`,
        );
        await this.database(JobsTableName)
            .insert({
                project_uuid: projectUuid,
                job_uuid: jobUuid,
                job_status: status,
                updated_at: new Date(),
            })
            .onConflict('job_uuid')
            .merge();
    }

    async createJobSteps(
        jobUuid: string,
        stepTypes: JobStepType[],
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await stepTypes.reduce(async (previousPromise, step) => {
                await previousPromise;
                return trx(JobStepsTableName).insert({
                    job_uuid: jobUuid,
                    step_status: JobStepStatusType.PENDING,
                    step_type: step,
                    step_error: undefined,
                });
            }, Promise.resolve());
        });
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

    async tryJobStep<T>(
        jobUuid: string,
        jobStepType: JobStepType,
        callback: () => Promise<T>,
    ): Promise<T> {
        try {
            await this.updateJobStep(
                jobUuid,
                JobStepStatusType.RUNNING,
                jobStepType,
            );

            const result = await callback();

            await this.updateJobStep(
                jobUuid,
                JobStepStatusType.DONE,
                jobStepType,
            );
            return result;
        } catch (e) {
            await this.updateJobStep(
                jobUuid,
                JobStepStatusType.ERROR,
                jobStepType,
                `${e}`,
            );
            throw e; // throw the error again
        }
    }
}
