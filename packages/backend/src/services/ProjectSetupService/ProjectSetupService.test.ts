import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ProjectSetupFinish,
    ProjectSetupStepName,
    ProjectSetupStepStatus,
    type PossibleAbilities,
    type ProjectSetupState,
    type RegisteredAccount,
} from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type ProjectSetupModel } from '../../models/ProjectSetupModel/ProjectSetupModel';
import { buildAccount } from '../ProjectService/ProjectService.mock';
import { ProjectSetupService } from './ProjectSetupService';

const organizationUuid = 'organization-uuid';
const projectUuid = 'project-uuid';

const buildUser = (actions: ('view' | 'update')[]): RegisteredAccount => {
    const account = buildAccount() as RegisteredAccount;
    return {
        ...account,
        user: {
            ...account.user,
            ability: new Ability<PossibleAbilities>([
                {
                    subject: 'Project',
                    action: actions,
                    conditions: { organizationUuid },
                },
            ]),
        },
        organization: { ...account.organization, organizationUuid },
    } as RegisteredAccount;
};

const buildState = (
    semanticLayer: ProjectSetupStepStatus,
): ProjectSetupState => ({
    projectSetupUuid: 'setup-uuid',
    projectUuid,
    configurationRevision: 1,
    steps: [
        {
            step: ProjectSetupStepName.WAREHOUSE_CONNECTION,
            status: ProjectSetupStepStatus.SUCCEEDED,
            configurationRevision: 1,
            isCurrent: true,
            updatedAt: new Date(),
        },
        {
            step: ProjectSetupStepName.SEMANTIC_LAYER,
            status: semanticLayer,
            configurationRevision: 1,
            isCurrent: true,
            updatedAt: new Date(),
        },
    ],
    resumeStep: null,
    finish:
        semanticLayer === ProjectSetupStepStatus.SKIPPED
            ? ProjectSetupFinish.CONNECTED
            : null,
});

const buildService = ({
    enabled = true,
    projectOrganizationUuid = organizationUuid,
    states = [buildState(ProjectSetupStepStatus.NOT_STARTED)],
}: {
    enabled?: boolean;
    projectOrganizationUuid?: string;
    states?: (ProjectSetupState | null)[];
} = {}) => {
    const findStateByProjectUuid = vi.fn();
    states.forEach((state) =>
        findStateByProjectUuid.mockResolvedValueOnce(state),
    );
    const projectSetupModel = {
        findStateByProjectUuid,
        setStepStatusForProject: vi.fn(async () => true),
    };
    const featureFlagModel = {
        get: vi.fn(async ({ featureFlagId }: { featureFlagId: string }) => ({
            id: featureFlagId,
            enabled: enabled && featureFlagId === FeatureFlags.ConnectJourney,
        })),
    };
    const projectModel = {
        getSummary: vi.fn(async () => ({
            projectUuid,
            organizationUuid: projectOrganizationUuid,
        })),
    };
    const service = new ProjectSetupService({
        projectSetupModel: projectSetupModel as unknown as ProjectSetupModel,
        projectModel: projectModel as unknown as ProjectModel,
        featureFlagModel: featureFlagModel as unknown as FeatureFlagModel,
    });
    return { service, projectSetupModel, featureFlagModel };
};

describe('ProjectSetupService', () => {
    describe('getProjectSetup', () => {
        it('rejects every request when the flag is off', async () => {
            const { service, projectSetupModel } = buildService({
                enabled: false,
            });

            await expect(
                service.getProjectSetup(buildUser(['view']), projectUuid),
            ).rejects.toThrow(ForbiddenError);
            expect(
                projectSetupModel.findStateByProjectUuid,
            ).not.toHaveBeenCalled();
        });

        it('returns the state to a user who can view the project', async () => {
            const { service } = buildService();

            await expect(
                service.getProjectSetup(buildUser(['view']), projectUuid),
            ).resolves.toMatchObject({ projectUuid });
        });

        it('returns null for a project created without setup tracking', async () => {
            const { service } = buildService({ states: [null] });

            await expect(
                service.getProjectSetup(buildUser(['view']), projectUuid),
            ).resolves.toBeNull();
        });

        it('hides projects in another organization', async () => {
            const { service, projectSetupModel } = buildService({
                projectOrganizationUuid: 'other-organization-uuid',
            });

            await expect(
                service.getProjectSetup(buildUser(['view']), projectUuid),
            ).rejects.toThrow(NotFoundError);
            expect(
                projectSetupModel.findStateByProjectUuid,
            ).not.toHaveBeenCalled();
        });

        it('rejects a user without view access', async () => {
            const { service } = buildService();

            await expect(
                service.getProjectSetup(buildUser([]), projectUuid),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('skipSemanticLayer', () => {
        it('records the skip and returns the connected finish', async () => {
            const { service, projectSetupModel } = buildService({
                states: [
                    buildState(ProjectSetupStepStatus.NOT_STARTED),
                    buildState(ProjectSetupStepStatus.SKIPPED),
                ],
            });

            const state = await service.skipSemanticLayer(
                buildUser(['view', 'update']),
                projectUuid,
            );

            expect(
                projectSetupModel.setStepStatusForProject,
            ).toHaveBeenCalledWith({
                projectUuid,
                step: ProjectSetupStepName.SEMANTIC_LAYER,
                status: ProjectSetupStepStatus.SKIPPED,
            });
            expect(state.finish).toBe(ProjectSetupFinish.CONNECTED);
        });

        it.each([
            ProjectSetupStepStatus.FAILED,
            ProjectSetupStepStatus.PARTIAL,
        ])('allows skipping after a %s deploy', async (status) => {
            const { service, projectSetupModel } = buildService({
                states: [
                    buildState(status),
                    buildState(ProjectSetupStepStatus.SKIPPED),
                ],
            });

            await service.skipSemanticLayer(
                buildUser(['view', 'update']),
                projectUuid,
            );

            expect(
                projectSetupModel.setStepStatusForProject,
            ).toHaveBeenCalledOnce();
        });

        it.each([
            ProjectSetupStepStatus.SUCCEEDED,
            ProjectSetupStepStatus.RUNNING,
        ])('refuses to skip a %s semantic layer', async (status) => {
            const { service, projectSetupModel } = buildService({
                states: [buildState(status)],
            });

            await expect(
                service.skipSemanticLayer(
                    buildUser(['view', 'update']),
                    projectUuid,
                ),
            ).rejects.toThrow(ParameterError);
            expect(
                projectSetupModel.setStepStatusForProject,
            ).not.toHaveBeenCalled();
        });

        it('rejects a user who cannot update the project', async () => {
            const { service, projectSetupModel } = buildService();

            await expect(
                service.skipSemanticLayer(buildUser(['view']), projectUuid),
            ).rejects.toThrow(ForbiddenError);
            expect(
                projectSetupModel.setStepStatusForProject,
            ).not.toHaveBeenCalled();
        });

        it('reports a project without setup tracking', async () => {
            const { service } = buildService({ states: [null] });

            await expect(
                service.skipSemanticLayer(
                    buildUser(['view', 'update']),
                    projectUuid,
                ),
            ).rejects.toThrow(NotFoundError);
        });
    });
});
