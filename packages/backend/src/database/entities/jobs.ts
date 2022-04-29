import { JobStatusType, JobStepStatusType, JobStepType } from 'common';
import { Knex } from 'knex';

export const JobsTableName = 'jobs';
export const JobStepsTableName = 'job_steps';

export type DbJobs = {
    job_uuid: string;
    project_uuid: string | undefined;
    created_at: Date;
    updated_at: Date;
    job_status: JobStatusType;
};

type UpdateJob = Pick<
    DbJobs,
    'project_uuid' | 'job_uuid' | 'job_status' | 'updated_at'
>;

export type JobsTable = Knex.CompositeTableType<DbJobs, UpdateJob>;

export type DbJobSteps = {
    step_id: number;
    job_uuid: string;
    created_at: Date;
    updated_at: Date;
    step_status: JobStepStatusType;
    step_type: JobStepType;
    step_error: string | undefined;
};

type CreateJobStep = Pick<
    DbJobSteps,
    'job_uuid' | 'step_status' | 'step_type' | 'step_error'
>;

type UpdateJobStep = Pick<
    DbJobSteps,
    'step_status' | 'updated_at' | 'step_error'
>;

export type JobStepsTable = Knex.CompositeTableType<
    DbJobSteps,
    CreateJobStep,
    UpdateJobStep
>;
