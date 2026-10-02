import {
    ProjectSetupFinish,
    ProjectSetupStepName,
    ProjectSetupStepStatus,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { toProjectSetupState } from './ProjectSetupModel';

const setup = {
    project_setup_uuid: 'setup-uuid',
    organization_uuid: 'organization-uuid',
    project_uuid: 'project-uuid',
    created_by_user_uuid: 'user-uuid',
    configuration_revision: 2,
    created_at: new Date('2026-10-01T09:00:00.000Z'),
    updated_at: new Date('2026-10-01T09:00:00.000Z'),
};

describe('toProjectSetupState', () => {
    it('fills missing steps as not started and resumes at the first', () => {
        const state = toProjectSetupState({ ...setup, project_uuid: null }, []);

        expect(state.steps).toEqual([
            {
                step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
                status: ProjectSetupStepStatus.NOT_STARTED,
                configurationRevision: null,
                isCurrent: false,
                updatedAt: null,
            },
            {
                step: ProjectSetupStepName.SEMANTIC_LAYER,
                status: ProjectSetupStepStatus.NOT_STARTED,
                configurationRevision: null,
                isCurrent: false,
                updatedAt: null,
            },
        ]);
        expect(state.resumeStep).toBe(
            ProjectSetupStepName.WAREHOUSE_CONNECTION,
        );
        expect(state.finish).toBeNull();
    });

    it('marks a step that ran on an older revision as not current', () => {
        const updatedAt = new Date('2026-10-01T10:00:00.000Z');
        const state = toProjectSetupState(setup, [
            {
                project_setup_uuid: setup.project_setup_uuid,
                step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
                status: ProjectSetupStepStatus.SUCCEEDED,
                configuration_revision: 1,
                updated_at: updatedAt,
            },
            {
                project_setup_uuid: setup.project_setup_uuid,
                step: ProjectSetupStepName.SEMANTIC_LAYER,
                status: ProjectSetupStepStatus.SUCCEEDED,
                configuration_revision: 2,
                updated_at: updatedAt,
            },
        ]);

        expect(state.steps.map((step) => step.isCurrent)).toEqual([
            false,
            true,
        ]);
        expect(state.resumeStep).toBeNull();
        expect(state.finish).toBe(ProjectSetupFinish.DEPLOYED);
    });

    it('resumes at a partial semantic layer', () => {
        const state = toProjectSetupState(setup, [
            {
                project_setup_uuid: setup.project_setup_uuid,
                step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
                status: ProjectSetupStepStatus.SUCCEEDED,
                configuration_revision: 2,
                updated_at: new Date(),
            },
            {
                project_setup_uuid: setup.project_setup_uuid,
                step: ProjectSetupStepName.SEMANTIC_LAYER,
                status: ProjectSetupStepStatus.PARTIAL,
                configuration_revision: 2,
                updated_at: new Date(),
            },
        ]);

        expect(state.resumeStep).toBe(ProjectSetupStepName.SEMANTIC_LAYER);
        expect(state.finish).toBeNull();
    });
});
