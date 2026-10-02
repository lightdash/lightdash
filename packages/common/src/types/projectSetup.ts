import assertUnreachable from '../utils/assertUnreachable';

export enum ProjectSetupStepName {
    WAREHOUSE_CONNECTION = 'warehouse_connection',
    SEMANTIC_LAYER = 'semantic_layer',
}

export const PROJECT_SETUP_STEP_ORDER: readonly ProjectSetupStepName[] = [
    ProjectSetupStepName.WAREHOUSE_CONNECTION,
    ProjectSetupStepName.SEMANTIC_LAYER,
];

export enum ProjectSetupStepStatus {
    NOT_STARTED = 'not_started',
    RUNNING = 'running',
    FAILED = 'failed',
    PARTIAL = 'partial',
    SUCCEEDED = 'succeeded',
    SKIPPED = 'skipped',
}

export enum ProjectSetupFinish {
    CONNECTED = 'connected',
    DEPLOYED = 'deployed',
}

export type ProjectSetupStep = {
    step: ProjectSetupStepName;
    status: ProjectSetupStepStatus;
    configurationRevision: number | null;
    isCurrent: boolean;
    updatedAt: Date | null;
};

export type ProjectSetupState = {
    projectSetupUuid: string;
    projectUuid: string | null;
    configurationRevision: number;
    steps: ProjectSetupStep[];
    resumeStep: ProjectSetupStepName | null;
    finish: ProjectSetupFinish | null;
};

export type ApiProjectSetupResponse = {
    status: 'ok';
    results: ProjectSetupState | null;
};

export type ApiSkipProjectSetupStepResponse = {
    status: 'ok';
    results: ProjectSetupState;
};

const isSettledStatus = (status: ProjectSetupStepStatus) =>
    status === ProjectSetupStepStatus.SUCCEEDED ||
    status === ProjectSetupStepStatus.SKIPPED;

const getStepStatus = (
    steps: Pick<ProjectSetupStep, 'step' | 'status'>[],
    name: ProjectSetupStepName,
): ProjectSetupStepStatus =>
    steps.find((step) => step.step === name)?.status ??
    ProjectSetupStepStatus.NOT_STARTED;

export const getProjectSetupResumeStep = (
    steps: Pick<ProjectSetupStep, 'step' | 'status'>[],
): ProjectSetupStepName | null =>
    PROJECT_SETUP_STEP_ORDER.find(
        (name) => !isSettledStatus(getStepStatus(steps, name)),
    ) ?? null;

export const getProjectSetupFinish = (
    steps: Pick<ProjectSetupStep, 'step' | 'status'>[],
): ProjectSetupFinish | null => {
    if (
        getStepStatus(steps, ProjectSetupStepName.WAREHOUSE_CONNECTION) !==
        ProjectSetupStepStatus.SUCCEEDED
    ) {
        return null;
    }
    const semanticLayerStatus = getStepStatus(
        steps,
        ProjectSetupStepName.SEMANTIC_LAYER,
    );
    switch (semanticLayerStatus) {
        case ProjectSetupStepStatus.SUCCEEDED:
            return ProjectSetupFinish.DEPLOYED;
        case ProjectSetupStepStatus.SKIPPED:
            return ProjectSetupFinish.CONNECTED;
        case ProjectSetupStepStatus.NOT_STARTED:
        case ProjectSetupStepStatus.RUNNING:
        case ProjectSetupStepStatus.FAILED:
        case ProjectSetupStepStatus.PARTIAL:
            return null;
        default:
            return assertUnreachable(
                semanticLayerStatus,
                `Unknown setup step status ${semanticLayerStatus}`,
            );
    }
};

export const getSemanticLayerCompileStatus = ({
    failedConnectionCount,
}: {
    failedConnectionCount: number;
}): ProjectSetupStepStatus.SUCCEEDED | ProjectSetupStepStatus.PARTIAL =>
    failedConnectionCount > 0
        ? ProjectSetupStepStatus.PARTIAL
        : ProjectSetupStepStatus.SUCCEEDED;
