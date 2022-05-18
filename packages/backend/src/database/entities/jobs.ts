import {
    Job,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
} from '@lightdash/common';
import { Knex } from 'knex';

export const JobsTableName = 'jobs';
export const JobStepsTableName = 'job_steps';

export type DbJobs = {
    job_uuid: string;
    project_uuid: string | undefined;
    user_uuid: string | undefined;
    created_at: Date;
    updated_at: Date;
    job_status: JobStatusType;
    job_type: Job['jobType'];
    results?: Job['jobResults'];
};

type CreateJob = Pick<
    DbJobs,
    'project_uuid' | 'job_uuid' | 'job_status' | 'job_type' | 'user_uuid'
>;

type UpdateJob = Partial<
    Pick<
        DbJobs,
        'project_uuid' | 'job_status' | 'updated_at' | 'results' | 'job_type'
    >
>;

export type JobsTable = Knex.CompositeTableType<DbJobs, CreateJob, UpdateJob>;

export type DbJobSteps = {
    step_id: number;
    job_uuid: string;
    created_at: Date;
    updated_at: Date;
    step_status: JobStepStatusType;
    step_type: JobStepType;
    step_error: string | undefined;
    started_at: Date | undefined;
};

type CreateJobStep = Pick<DbJobSteps, 'job_uuid' | 'step_status' | 'step_type'>;

type UpdateJobStep = Partial<
    Pick<DbJobSteps, 'step_status' | 'updated_at' | 'step_error' | 'started_at'>
>;

export type JobStepsTable = Knex.CompositeTableType<
    DbJobSteps,
    CreateJobStep,
    UpdateJobStep
>;
