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

    async getLastJob(projectUuid: string): Promise<Job | undefined> {
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

        return steps.map((step) => ({
            jobUuid: step.job_uuid,
            createdAt: step.created_at,
            updatedAt: step.updated_at,
            stepStatus: step.step_status,
            stepType: step.step_type,
            stepLabel: step.step_label,
        }));
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
            await stepTypes.forEach(async (step) => {
                const stepLabel = JobLabels[step];
                await trx(JobStepsTableName).insert({
                    job_uuid: jobUuid,
                    step_status: JobStepStatusType.PENDING,
                    step_type: step,
                    step_label: stepLabel,
                });
            });
        });
    }

    async updateJobStep(
        jobUuid: string,
        stepStatus: JobStepStatusType,
        stepType: JobStepType,
    ): Promise<void> {
        await this.database(JobStepsTableName)
            .update({
                step_status: stepStatus,
                updated_at: new Date(),
            })
            .where('job_uuid', jobUuid)
            .andWhere('step_type', stepType);

        await this.database(JobsTableName)
            .update({
                updated_at: new Date(),
                job_status: JobStatusType.RUNNING, // TODO handle step error
            })
            .where('job_uuid', jobUuid);
    }
}
