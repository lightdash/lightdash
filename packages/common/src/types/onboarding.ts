import type { ApiSuccess } from './api/success';

export enum OnboardingStepType {
    CONNECT = 'connect',
    PROFILE = 'profile',
    SEMANTIC_LAYER = 'semantic_layer',
    DASHBOARD = 'dashboard',
}

export enum OnboardingStepStatus {
    PENDING = 'pending',
    IN_PROGRESS = 'in_progress',
    COMPLETED = 'completed',
    ERROR = 'error',
}

export type OnboardingProjectStep = {
    step: OnboardingStepType;
    status: OnboardingStepStatus;
    result: Record<string, unknown> | null;
    updatedAt: Date;
};

export type OnboardingProjectState = {
    projectUuid: string;
    steps: OnboardingProjectStep[];
};

export type UpdateOnboardingProjectStep = Pick<
    OnboardingProjectStep,
    'step' | 'status' | 'result'
>;

export type ConnectionCheckStatus =
    | 'pending'
    | 'running'
    | 'passed'
    | 'failed'
    | 'skipped';

export type ConnectionCheckId =
    | 'resolve_host'
    | 'open_connection'
    | 'authenticate'
    | 'list_schemas'
    | 'select_1';

export type ConnectionCheckDiagnosis = {
    title: string;
    detail: string;
    remedySql: string | null;
    docsUrl: string | null;
};

export type ConnectionCheck = {
    id: ConnectionCheckId;
    label: string;
    status: ConnectionCheckStatus;
    durationMs: number | null;
    diagnosis: ConnectionCheckDiagnosis | null;
};

export type ConnectionDiagnosticResult = {
    status: 'passed' | 'failed';
    checks: ConnectionCheck[];
};

export type ApiOnboardingProjectStateResponse =
    ApiSuccess<OnboardingProjectState>;

export type ApiConnectionDiagnosticResponse =
    ApiSuccess<ConnectionDiagnosticResult>;
