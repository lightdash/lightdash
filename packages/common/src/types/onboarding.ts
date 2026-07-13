import type { ApiSuccess } from './api/success';
import type { JoinRelationship } from './explore';
import type { DimensionType, MetricType } from './field';
import type { CreateWarehouseCredentials } from './projects';

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

export type TestOnboardingConnectionRequest = {
    warehouseConnection: CreateWarehouseCredentials;
};

export type GrantScriptRequest = {
    roleName: string;
    databaseName: string;
    warehouseName: string;
    userName: string | null;
    schemas: string[] | null;
};

export type GrantScriptResult = {
    sql: string;
};

export type ApiGrantScriptResponse = ApiSuccess<GrantScriptResult>;

export type ProfiledColumn = {
    name: string;
    type: DimensionType;
};

export type ProfiledTable = {
    database: string;
    schema: string;
    name: string;
    tableType: 'table' | 'view' | null;
    rowCount: number | null;
    columns: ProfiledColumn[];
};

export type InferredEntity = {
    database: string;
    schema: string;
    tableName: string;
    label: string;
    description: string;
    rowCount: number | null;
    columnCount: number;
    primaryKey: string | null;
    notes: string[];
};

export type InferredRelationship = {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    type: 'many_to_one';
    confidence: 'high' | 'low';
};

export type ProfileResult = {
    tables: ProfiledTable[];
    entities: InferredEntity[];
    relationships: InferredRelationship[];
    truncated: boolean;
    profiledAt: string;
};

export type ProfileErrorResult = {
    error: string;
};

export type ApiOnboardingProfileResponse = ApiSuccess<ProfileResult>;

export type ApiScheduleOnboardingProfileResponse = ApiSuccess<{
    jobUuid: string;
}>;

export type SemanticLayerFieldSource = {
    table: string;
    column: string;
};

export type SemanticLayerMetric = {
    name: string;
    label: string;
    type: MetricType;
    source: SemanticLayerFieldSource;
    hidden: boolean;
};

export type SemanticLayerDimension = {
    name: string;
    label: string;
    type: DimensionType;
    source: SemanticLayerFieldSource;
    hidden: boolean;
};

export type SemanticLayerJoin = {
    table: string;
    sqlOn: string;
    relationship: JoinRelationship | null;
};

export type SemanticLayerExplore = {
    name: string;
    label: string;
    baseTable: string;
    metrics: SemanticLayerMetric[];
    dimensions: SemanticLayerDimension[];
    joins: SemanticLayerJoin[];
};

export type SemanticLayerValidationError = {
    exploreName: string;
    message: string;
};

export type SemanticLayerResult = {
    explores: SemanticLayerExplore[];
    skippedTableCount: number;
    validationErrors: SemanticLayerValidationError[];
    generatedAt: string;
};

export type SemanticLayerErrorResult = {
    error: string;
};

export type UpdateSemanticLayerFieldRequest = {
    exploreName: string;
    fieldType: 'dimension' | 'metric';
    fieldName: string;
    label: string | null;
    hidden: boolean | null;
};

export type ApiOnboardingSemanticLayerResponse =
    ApiSuccess<SemanticLayerResult>;

export type ApiScheduleOnboardingSemanticLayerResponse = ApiSuccess<{
    jobUuid: string;
}>;
