import { subject } from '@casl/ability';
import {
    ForbiddenError,
    OnboardingProjectState,
    OnboardingStepStatus,
    OnboardingStepType,
    type RegisteredAccount,
} from '@lightdash/common';
import { OnboardingProjectStateModel } from '../../models/OnboardingProjectStateModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';

type OnboardingFlowServiceArguments = {
    onboardingProjectStateModel: OnboardingProjectStateModel;
    projectModel: ProjectModel;
};

export class OnboardingFlowService extends BaseService {
    private readonly onboardingProjectStateModel: OnboardingProjectStateModel;

    private readonly projectModel: ProjectModel;

    constructor(args: OnboardingFlowServiceArguments) {
        super();
        this.onboardingProjectStateModel = args.onboardingProjectStateModel;
        this.projectModel = args.projectModel;
    }

    async getState(
        account: RegisteredAccount,
        projectUuid: string,
    ): Promise<OnboardingProjectState> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (auditedAbility.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        return {
            projectUuid,
            steps: await this.onboardingProjectStateModel.getAll(projectUuid),
        };
    }

    async updateStep(
        account: RegisteredAccount,
        projectUuid: string,
        step: OnboardingStepType,
        status: OnboardingStepStatus,
        result: Record<string, unknown> | null,
    ): Promise<OnboardingProjectState> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.onboardingProjectStateModel.upsert(
            projectUuid,
            step,
            status,
            result,
        );
        return {
            projectUuid,
            steps: await this.onboardingProjectStateModel.getAll(projectUuid),
        };
    }
}
