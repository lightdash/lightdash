export enum JobType {
    COMPILE_PROJECT = 'COMPILE_PROJECT',
    CREATE_PROJECT = 'CREATE_PROJECT',
}

export enum JobStatusType {
    STARTED = 'STARTED',
    DONE = 'DONE',
    RUNNING = 'RUNNING',
    ERROR = 'ERROR',
}

export enum JobStepStatusType {
    DONE = 'DONE',
    RUNNING = 'RUNNING',
    ERROR = 'ERROR',
    PENDING = 'PENDING',
    SKIPPED = 'SKIPPED',
}
export enum JobStepType {
    /* CLONING = 'CLONING',
    INSTALLING_DEPENDENCIES = 'INSTALLING_DEPENDENCIES',
    COMPILING_DBT = 'COMPILING_DBT',
    GETTING_SCHEMA = 'GETTING_SCHEMA',
    COMPILING_METRICS = 'COMPILING_METRICS', */
    TESTING_ADAPTOR = 'TESTING_ADAPTOR',
    COMPILING = 'COMPILING',
    CREATING_PROJECT = 'CREATING_PROJECT',
    CACHING = 'CACHING',
}

export const JobLabels = {
    /* CLONING: 'Cloning dbt project from Github',
    INSTALLING_DEPENDENCIES: 'Installing dbt project dependencies',
    COMPILING_DBT: 'Compiling dbt project',
    GETTING_SCHEMA: 'Getting latest data warehouse schema',
    COMPILING_METRICS: 'Compiling metrics & dimensions', */
    TESTING_ADAPTOR: 'Testing adaptor',
    COMPILING: 'Compiling',
    CREATING_PROJECT: 'Creating project',
    CACHING: 'Saving cache',
};

export type BaseJob = {
    jobUuid: string;
    projectUuid: string | undefined;
    userUuid: string | undefined;
    createdAt: Date;
    updatedAt: Date;
    jobStatus: JobStatusType;
    steps: JobStep[];
};

type CompileJob = BaseJob & {
    jobType: JobType.COMPILE_PROJECT;
    jobResults?: undefined;
};

type CreateProjectJob = BaseJob & {
    jobType: JobType.CREATE_PROJECT;
    jobResults?: {
        projectUuid: string;
    };
};

export type Job = CompileJob | CreateProjectJob;

export type CreateJob = Pick<
    Job,
    'jobUuid' | 'projectUuid' | 'jobType' | 'jobStatus' | 'userUuid'
> & {
    steps: CreateJobStep[];
};

export type JobStep = {
    jobUuid: string;
    createdAt: Date;
    updatedAt: Date;
    stepStatus: JobStepStatusType;
    stepType: JobStepType;
    stepError: string | undefined;
    stepDbtLogs: DbtLog[] | undefined;
    stepLabel: string;
    startedAt: Date | undefined;
};

type CreateJobStep = Pick<JobStep, 'stepType'>;

// https://docs.getdbt.com/reference/events-logging#structured-logging
export type DbtLog = {
    code: string;
    data: unknown;
    invocation_id: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    log_version: number;
    msg: string;
    node_info: {
        materialized: string;
        node_finished_at: string | null;
        node_name: string;
        node_path: string;
        node_started_at: string;
        node_status: string;
        resource_type: string;
        type: 'node_status';
        unique_id: string;
    };
    pid: number;
    thread_name: string;
    ts: string;
    type: 'log_line';
};

export function isDbtLog(value: unknown): value is DbtLog {
    return (
        value != null &&
        typeof value === 'object' &&
        'level' in value &&
        'msg' in value
    );
}
