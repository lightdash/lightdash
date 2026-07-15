import { subject } from '@casl/ability';
import {
    CommercialFeatureFlags,
    defaultHomepageConfig,
    ForbiddenError,
    HOMEPAGE_MAX_BLOCKS_PER_ROW,
    NotFoundError,
    ParameterError,
    type CreateProjectHomepageRequest,
    type HomepageConfig,
    type HomepageRecentlyViewedItem,
    type ProjectHomepage,
    type PublishedProjectHomepage,
    type SessionUser,
    type UpdateProjectHomepageDraftRequest,
} from '@lightdash/common';
import { BaseService } from '../../services/BaseService';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { type ProjectHomepageModel } from '../models/ProjectHomepageModel';

export type ProjectHomepageServiceArguments = {
    projectHomepageModel: Pick<
        ProjectHomepageModel,
        | 'getDefault'
        | 'getByUuid'
        | 'getPublishedDefault'
        | 'getRecentlyViewed'
        | 'list'
        | 'create'
        | 'updateDraft'
        | 'publish'
        | 'delete'
    >;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
};

export class ProjectHomepageService extends BaseService {
    private readonly projectHomepageModel: ProjectHomepageServiceArguments['projectHomepageModel'];

    private readonly featureFlagService: ProjectHomepageServiceArguments['featureFlagService'];

    constructor(args: ProjectHomepageServiceArguments) {
        super();
        this.projectHomepageModel = args.projectHomepageModel;
        this.featureFlagService = args.featureFlagService;
    }

    private async assertFlagEnabled(user: SessionUser): Promise<void> {
        const flag = await this.featureFlagService.get({
            user,
            featureFlagId: CommercialFeatureFlags.HomepageBuilder,
        });
        if (!flag.enabled) {
            throw new ForbiddenError('Homepage builder is not enabled');
        }
    }

    private assertCanView(user: SessionUser, projectUuid: string): void {
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
    }

    private assertCanManage(user: SessionUser, projectUuid: string): void {
        if (!user.organizationUuid) {
            throw new ForbiddenError();
        }
        const ability = this.createAuditedAbility(user);
        if (
            ability.cannot(
                'manage',
                subject('ProjectHomepage', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                'Insufficient permissions to manage the project homepage',
            );
        }
    }

    private static validateConfig(config: HomepageConfig): void {
        if (config.version !== 1) {
            throw new ParameterError('Unsupported homepage config version');
        }
        const oversizedRow = config.rows.find(
            (row) => row.blocks.length > HOMEPAGE_MAX_BLOCKS_PER_ROW,
        );
        if (oversizedRow) {
            throw new ParameterError(
                `Rows support at most ${HOMEPAGE_MAX_BLOCKS_PER_ROW} blocks`,
            );
        }
    }

    private async getOwnedHomepage(
        projectUuid: string,
        homepageUuid: string,
    ): Promise<ProjectHomepage> {
        const homepage =
            await this.projectHomepageModel.getByUuid(homepageUuid);
        if (!homepage || homepage.projectUuid !== projectUuid) {
            throw new NotFoundError('Homepage not found');
        }
        return homepage;
    }

    async getPublishedHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<PublishedProjectHomepage | null> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        const published =
            await this.projectHomepageModel.getPublishedDefault(projectUuid);
        return published ?? null;
    }

    async getRecentlyViewed(
        user: SessionUser,
        projectUuid: string,
    ): Promise<HomepageRecentlyViewedItem[]> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        return this.projectHomepageModel.getRecentlyViewed(
            projectUuid,
            user.userUuid,
        );
    }

    async getHomepageForBuilder(
        user: SessionUser,
        projectUuid: string,
        homepageUuid?: string,
    ): Promise<ProjectHomepage | null> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        if (homepageUuid) {
            return this.getOwnedHomepage(projectUuid, homepageUuid);
        }
        const homepage =
            await this.projectHomepageModel.getDefault(projectUuid);
        if (homepage) return homepage;
        const [first] = await this.projectHomepageModel.list(projectUuid);
        return first ?? null;
    }

    async listHomepages(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectHomepage[]> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        return this.projectHomepageModel.list(projectUuid);
    }

    async createHomepage(
        user: SessionUser,
        projectUuid: string,
        data: CreateProjectHomepageRequest,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        const draftConfig = data.duplicateFrom
            ? (await this.getOwnedHomepage(projectUuid, data.duplicateFrom))
                  .draftConfig
            : defaultHomepageConfig();
        return this.projectHomepageModel.create({
            projectUuid,
            name: data.name,
            draftConfig,
            createdByUserUuid: user.userUuid,
        });
    }

    async deleteHomepage(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        await this.projectHomepageModel.delete(homepageUuid);
    }

    async updateDraft(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
        data: UpdateProjectHomepageDraftRequest,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        ProjectHomepageService.validateConfig(data.draftConfig);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        return this.projectHomepageModel.updateDraft(homepageUuid, {
            name: data.name,
            draftConfig: data.draftConfig,
            baseUpdatedAt: data.baseUpdatedAt,
        });
    }

    async publishHomepage(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        return this.projectHomepageModel.publish(homepageUuid);
    }
}
