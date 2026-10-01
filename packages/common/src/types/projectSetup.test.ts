import { describe, expect, it } from 'vitest';
import {
    getProjectSetupFinish,
    getProjectSetupResumeStep,
    getSemanticLayerCompileStatus,
    ProjectSetupFinish,
    ProjectSetupStepName,
    ProjectSetupStepStatus,
} from './projectSetup';

const steps = (
    warehouse: ProjectSetupStepStatus | null,
    semanticLayer: ProjectSetupStepStatus | null,
) => [
    ...(warehouse
        ? [
              {
                  step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
                  status: warehouse,
              },
          ]
        : []),
    ...(semanticLayer
        ? [{ step: ProjectSetupStepName.SEMANTIC_LAYER, status: semanticLayer }]
        : []),
];

describe('getProjectSetupResumeStep', () => {
    it('starts at the warehouse connection when nothing is recorded', () => {
        expect(getProjectSetupResumeStep([])).toBe(
            ProjectSetupStepName.WAREHOUSE_CONNECTION,
        );
    });

    it.each([
        ProjectSetupStepStatus.NOT_STARTED,
        ProjectSetupStepStatus.RUNNING,
        ProjectSetupStepStatus.FAILED,
        ProjectSetupStepStatus.PARTIAL,
    ])('stays on the warehouse connection when it is %s', (status) => {
        expect(getProjectSetupResumeStep(steps(status, null))).toBe(
            ProjectSetupStepName.WAREHOUSE_CONNECTION,
        );
    });

    it('moves to the semantic layer once the warehouse succeeded', () => {
        expect(
            getProjectSetupResumeStep(
                steps(ProjectSetupStepStatus.SUCCEEDED, null),
            ),
        ).toBe(ProjectSetupStepName.SEMANTIC_LAYER);
    });

    it.each([
        ProjectSetupStepStatus.NOT_STARTED,
        ProjectSetupStepStatus.RUNNING,
        ProjectSetupStepStatus.FAILED,
        ProjectSetupStepStatus.PARTIAL,
    ])('resumes the semantic layer when it is %s', (status) => {
        expect(
            getProjectSetupResumeStep(
                steps(ProjectSetupStepStatus.SUCCEEDED, status),
            ),
        ).toBe(ProjectSetupStepName.SEMANTIC_LAYER);
    });

    it.each([ProjectSetupStepStatus.SUCCEEDED, ProjectSetupStepStatus.SKIPPED])(
        'has nothing to resume when the semantic layer is %s',
        (status) => {
            expect(
                getProjectSetupResumeStep(
                    steps(ProjectSetupStepStatus.SUCCEEDED, status),
                ),
            ).toBeNull();
        },
    );
});

describe('getProjectSetupFinish', () => {
    it('is unfinished until the warehouse connection succeeded', () => {
        expect(
            getProjectSetupFinish(
                steps(
                    ProjectSetupStepStatus.FAILED,
                    ProjectSetupStepStatus.SUCCEEDED,
                ),
            ),
        ).toBeNull();
    });

    it('finishes as connected when the semantic layer is skipped', () => {
        expect(
            getProjectSetupFinish(
                steps(
                    ProjectSetupStepStatus.SUCCEEDED,
                    ProjectSetupStepStatus.SKIPPED,
                ),
            ),
        ).toBe(ProjectSetupFinish.CONNECTED);
    });

    it('finishes as deployed when the semantic layer succeeded', () => {
        expect(
            getProjectSetupFinish(
                steps(
                    ProjectSetupStepStatus.SUCCEEDED,
                    ProjectSetupStepStatus.SUCCEEDED,
                ),
            ),
        ).toBe(ProjectSetupFinish.DEPLOYED);
    });

    it.each([
        ProjectSetupStepStatus.NOT_STARTED,
        ProjectSetupStepStatus.RUNNING,
        ProjectSetupStepStatus.FAILED,
        ProjectSetupStepStatus.PARTIAL,
    ])('is unfinished when the semantic layer is %s', (status) => {
        expect(
            getProjectSetupFinish(
                steps(ProjectSetupStepStatus.SUCCEEDED, status),
            ),
        ).toBeNull();
    });
});

describe('getSemanticLayerCompileStatus', () => {
    it('succeeds when no connection was carried forward as failed', () => {
        expect(
            getSemanticLayerCompileStatus({ failedConnectionCount: 0 }),
        ).toBe(ProjectSetupStepStatus.SUCCEEDED);
    });

    it('is partial when a failed connection was carried forward', () => {
        expect(
            getSemanticLayerCompileStatus({ failedConnectionCount: 2 }),
        ).toBe(ProjectSetupStepStatus.PARTIAL);
    });
});
