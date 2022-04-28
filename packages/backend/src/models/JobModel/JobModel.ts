import { Job, JobStatusType } from 'common';
import { Knex } from 'knex';
import { JobsTableName } from '../../database/entities/projects';
import { NotFoundError } from '../../errors';
import Logger from '../../logger';

import Transaction = Knex.Transaction;

type JobModelDependencies = {
    database: Knex;
};

const CACHED_EXPLORES_PG_LOCK_NAMESPACE = 1;

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

        // TODO get steps
        const job = jobs[0];
        return {
            createdAt: job.created_at,
            updatedAt: job.updated_at,
            projectUuid: job.project_uuid,
            jobUuid: job.job_uuid,
            jobStatus: job.job_status,
            steps: [],
        };
    }

    async getJobstatus(jobUuid: string): Promise<Job> {
        const jobs = await this.database(JobsTableName).where(
            'job_uuid',
            jobUuid,
        );

        // TODO get steps

        if (jobs.length === 0)
            throw new NotFoundError(
                `job with jobUuid ${jobUuid} does not exist`,
            );

        const job = jobs[0];
        return {
            createdAt: job.created_at,
            updatedAt: job.updated_at,
            projectUuid: job.project_uuid,
            jobUuid: job.job_uuid,
            jobStatus: job.job_status,
            steps: [],
        };
    }

    async upsertJobStatus(
        jobUuid: string | undefined,
        projectUuid: string,
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

    async addJobStep(
        jobUuid: string,
        status: JobStepStatusType,
        description: JobStepType,
    ): Promise<void> {
        Logger.debug(
            `Updating job status ${jobUuid} for project ${projectUuid} with status ${status}`,
        );
        await this.database(JobStepsTableName).insert({
            job_uuid: jobUuid,
            step_status: jobUuid,
            step_description: description,
        });
    }
}
