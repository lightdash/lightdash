export enum JobType {
    COMPILE_PROJECT = 'COMPILE_PROJECT',
    CREATE_PROJECT = 'CREATE_PROJECT',
    ONBOARDING_PROFILE = 'ONBOARDING_PROFILE',
    ONBOARDING_SEMANTIC = 'ONBOARDING_SEMANTIC',
    ONBOARDING_DASHBOARD = 'ONBOARDING_DASHBOARD',
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
    ONBOARDING_PROFILE_CONNECTING = 'ONBOARDING_PROFILE_CONNECTING',
    ONBOARDING_PROFILE_LISTING_TABLES = 'ONBOARDING_PROFILE_LISTING_TABLES',
    ONBOARDING_PROFILE_SAMPLING_COLUMNS = 'ONBOARDING_PROFILE_SAMPLING_COLUMNS',
    ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS = 'ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS',
    ONBOARDING_SEMANTIC_GENERATING_EXPLORES = 'ONBOARDING_SEMANTIC_GENERATING_EXPLORES',
    ONBOARDING_SEMANTIC_COMPILING_VALIDATING = 'ONBOARDING_SEMANTIC_COMPILING_VALIDATING',
    ONBOARDING_SEMANTIC_SAVING = 'ONBOARDING_SEMANTIC_SAVING',
    ONBOARDING_DASHBOARD_SELECTING_CONTENT = 'ONBOARDING_DASHBOARD_SELECTING_CONTENT',
    ONBOARDING_DASHBOARD_CREATING_CHARTS = 'ONBOARDING_DASHBOARD_CREATING_CHARTS',
    ONBOARDING_DASHBOARD_ASSEMBLING = 'ONBOARDING_DASHBOARD_ASSEMBLING',
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
    ONBOARDING_PROFILE_CONNECTING: 'Connecting',
    ONBOARDING_PROFILE_LISTING_TABLES: 'Listing tables',
    ONBOARDING_PROFILE_SAMPLING_COLUMNS: 'Sampling columns',
    ONBOARDING_PROFILE_INFERRING_RELATIONSHIPS:
        'Inferring entities and relationships',
    ONBOARDING_SEMANTIC_GENERATING_EXPLORES: 'Generating explores',
    ONBOARDING_SEMANTIC_COMPILING_VALIDATING: 'Compiling & validating',
    ONBOARDING_SEMANTIC_SAVING: 'Saving',
    ONBOARDING_DASHBOARD_SELECTING_CONTENT: 'Selecting content',
    ONBOARDING_DASHBOARD_CREATING_CHARTS: 'Creating charts',
    ONBOARDING_DASHBOARD_ASSEMBLING: 'Assembling dashboard',
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
    jobResults?: {
        indexCatalogJobUuid: string;
    };
};

type CreateProjectJob = BaseJob & {
    jobType: JobType.CREATE_PROJECT;
    jobResults?: {
        projectUuid: string;
    };
};

type OnboardingProfileJob = BaseJob & {
    jobType: JobType.ONBOARDING_PROFILE;
    jobResults?: undefined;
};

type OnboardingSemanticJob = BaseJob & {
    jobType: JobType.ONBOARDING_SEMANTIC;
    jobResults?: undefined;
};

type OnboardingDashboardJob = BaseJob & {
    jobType: JobType.ONBOARDING_DASHBOARD;
    jobResults?: undefined;
};

export type Job =
    | CompileJob
    | CreateProjectJob
    | OnboardingProfileJob
    | OnboardingSemanticJob
    | OnboardingDashboardJob;

export function isCompileJob(value: unknown): value is CompileJob {
    return (
        typeof value === 'object' &&
        value != null &&
        'jobType' in value &&
        value.jobType === JobType.COMPILE_PROJECT
    );
}

export function isCreateProjectJob(value: unknown): value is CreateProjectJob {
    return (
        typeof value === 'object' &&
        value != null &&
        'jobType' in value &&
        value.jobType === JobType.CREATE_PROJECT
    );
}

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
    info: {
        category: string;
        code: string;
        extra: Record<string, unknown>;
        invocation_id: string;
        level: 'debug' | 'info' | 'warn' | 'error';
        log_version: 2;
        msg: string;
        name: string;
        pid: number;
        thread_name: string;
        ts: string;
        type: 'log_line';
    };
};

export function isDbtLog(value: unknown): value is DbtLog {
    return (
        typeof value === 'object' &&
        value != null &&
        'info' in value &&
        typeof (value as DbtLog).info === 'object' &&
        typeof (value as DbtLog).info != null &&
        'level' in (value as DbtLog).info &&
        typeof (value as DbtLog).info.level === 'string' &&
        'msg' in (value as DbtLog).info &&
        typeof (value as DbtLog).info.msg === 'string'
    );
}
