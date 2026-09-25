import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    ProjectType,
    type ProjectNavigation,
    type ProjectSummary,
    type SessionUser,
} from '@lightdash/common';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../BaseService';
import { FeatureFlagService } from '../FeatureFlag/FeatureFlagService';

export type ProjectNavigationServiceArguments = {
    projectModel: Pick<ProjectModel, 'getSummary'>;
    catalogModel: Pick<CatalogModel, 'hasMetricsInCatalog'>;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
};

export class ProjectNavigationService extends BaseService {
    private readonly projectModel: ProjectNavigationServiceArguments['projectModel'];

    private readonly catalogModel: ProjectNavigationServiceArguments['catalogModel'];

    private readonly featureFlagService: ProjectNavigationServiceArguments['featureFlagService'];

    constructor({
        projectModel,
        catalogModel,
        featureFlagService,
    }: ProjectNavigationServiceArguments) {
        super();
        this.projectModel = projectModel;
        this.catalogModel = catalogModel;
        this.featureFlagService = featureFlagService;
    }

    async getProjectNavigation(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectNavigation> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(user).cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                    metadata: { projectUuid, projectName: project.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const [metrics, askAi, autopilot, learn] = await Promise.all([
            this.resolveItem('metrics', () =>
                this.catalogModel.hasMetricsInCatalog(projectUuid),
            ),
            this.resolveItem('askAi', () => this.isAskAiVisible(user, project)),
            this.resolveItem('autopilot', () =>
                this.isAutopilotVisible(user, project),
            ),
            this.resolveItem('learn', () => this.isLearnVisible(user, project)),
        ]);

        return { metrics, askAi, autopilot, learn };
    }

    // AI agents are an enterprise feature; the enterprise service overrides this.
    protected async isAskAiVisible(
        _user: SessionUser,
        _project: ProjectSummary,
    ): Promise<boolean> {
        return false;
    }

    private async isAutopilotVisible(
        user: SessionUser,
        project: ProjectSummary,
    ): Promise<boolean> {
        const canManageAgents = this.createAuditedAbility(user).can(
            'manage',
            subject('AiAgent', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        );
        if (!canManageAgents) return false;
        const flag = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.AiAutopilot,
        });
        return flag.enabled;
    }

    /**
     * Present for everyone in an org with the Learn flag on, whether or not the
     * training project exists yet (the page says how), and never on a preview
     * (a learner's training copy included): a library opened inside a copy
     * would start walkthroughs from the wrong place.
     */
    private async isLearnVisible(
        user: SessionUser,
        project: ProjectSummary,
    ): Promise<boolean> {
        if (project.type === ProjectType.PREVIEW) return false;
        const flag = await this.featureFlagService.get({
            user,
            featureFlagId: FeatureFlags.EnableLearn,
        });
        return flag.enabled;
    }

    // One failing check hides only its own item, like the per-button queries did.
    private async resolveItem(
        item: keyof ProjectNavigation,
        check: () => Promise<boolean>,
    ): Promise<boolean> {
        try {
            return await check();
        } catch (error) {
            if (!(error instanceof ForbiddenError)) {
                this.logger.error(`Failed to resolve navigation item ${item}`, {
                    error: getErrorMessage(error),
                });
            }
            return false;
        }
    }
}
