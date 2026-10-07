import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ProjectSetupStepName,
    ProjectSetupStepStatus,
    type ProjectSetupState,
    type RegisteredAccount,
} from '@lightdash/common';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { type ProjectSetupModel } from '../../models/ProjectSetupModel/ProjectSetupModel';
import { BaseService } from '../BaseService';

type ProjectSetupServiceArguments = {
    projectSetupModel: ProjectSetupModel;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
};

export class ProjectSetupService extends BaseService {
    private readonly projectSetupModel: ProjectSetupModel;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor({
        projectSetupModel,
        projectModel,
        featureFlagModel,
    }: ProjectSetupServiceArguments) {
        super();
        this.projectSetupModel = projectSetupModel;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
    }

    private async assertEnabled(account: RegisteredAccount): Promise<void> {
        const { enabled } = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization.organizationUuid,
            },
            featureFlagId: FeatureFlags.ConnectJourney,
        });
        if (!enabled) {
            throw new ForbiddenError('Project setup state is not enabled');
        }
    }

    private async assertCan(
        account: RegisteredAccount,
        action: 'view' | 'update',
        projectUuid: string,
    ): Promise<void> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (
            project.organizationUuid !== account.organization.organizationUuid
        ) {
            throw new NotFoundError('Project not found');
        }
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                action,
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    async getProjectSetup(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<ProjectSetupState | null> {
        await this.assertEnabled(account);
        await this.assertCan(account, 'view', projectUuid);
        return this.projectSetupModel.findStateByProjectUuid(projectUuid);
    }

    async skipSemanticLayer(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<ProjectSetupState> {
        await this.assertEnabled(account);
        await this.assertCan(account, 'update', projectUuid);
        const state =
            await this.projectSetupModel.findStateByProjectUuid(projectUuid);
        if (!state) {
            throw new NotFoundError('This project has no setup to skip');
        }
        const semanticLayer = state.steps.find(
            (step) => step.step === ProjectSetupStepName.SEMANTIC_LAYER,
        );
        if (
            semanticLayer?.status === ProjectSetupStepStatus.SUCCEEDED ||
            semanticLayer?.status === ProjectSetupStepStatus.RUNNING
        ) {
            throw new ParameterError(
                'The semantic layer step cannot be skipped once it has started',
            );
        }
        await this.projectSetupModel.setStepStatusForProject({
            projectUuid,
            step: ProjectSetupStepName.SEMANTIC_LAYER,
            status: ProjectSetupStepStatus.SKIPPED,
        });
        const updated =
            await this.projectSetupModel.findStateByProjectUuid(projectUuid);
        if (!updated) {
            throw new NotFoundError('This project has no setup');
        }
        return updated;
    }
}
