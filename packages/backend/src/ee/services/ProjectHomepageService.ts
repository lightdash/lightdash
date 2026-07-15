import { subject } from '@casl/ability';
import {
    CommercialFeatureFlags,
    defaultHomepageConfig,
    ForbiddenError,
    HOMEPAGE_MAX_BLOCKS_PER_ROW,
    NotFoundError,
    ParameterError,
    type CreateProjectHomepageRequest,
    type HomepageAssignment,
    type HomepageAudience,
    type HomepageConfig,
    type HomepageRecentlyViewedItem,
    type ProjectHomepage,
    type PublishedProjectHomepage,
    type ResolvedHomepage,
    type SessionUser,
    type UpdateProjectHomepageDraftRequest,
} from '@lightdash/common';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
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
        | 'getAssignments'
        | 'getPersonalOverride'
        | 'setPersonalOverride'
        | 'deletePersonalOverride'
        | 'updateGroupPriorities'
        | 'resolvePublished'
        | 'list'
        | 'create'
        | 'updateDraft'
        | 'publish'
        | 'delete'
    >;
    featureFlagService: Pick<FeatureFlagService, 'get'>;
    groupsModel: Pick<GroupsModel, 'findUserGroups'>;
    projectModel: Pick<ProjectModel, 'getProjectMemberAccess'>;
};

export class ProjectHomepageService extends BaseService {
    private readonly projectHomepageModel: ProjectHomepageServiceArguments['projectHomepageModel'];

    private readonly featureFlagService: ProjectHomepageServiceArguments['featureFlagService'];

    private readonly groupsModel: ProjectHomepageServiceArguments['groupsModel'];

    private readonly projectModel: ProjectHomepageServiceArguments['projectModel'];

    constructor(args: ProjectHomepageServiceArguments) {
        super();
        this.projectHomepageModel = args.projectHomepageModel;
        this.featureFlagService = args.featureFlagService;
        this.groupsModel = args.groupsModel;
        this.projectModel = args.projectModel;
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

    // Resolution: personal → group priority → role → project default
    async getResolvedHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ResolvedHomepage | null> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        const [override, groups, membership] = await Promise.all([
            this.projectHomepageModel.getPersonalOverride(
                user.userUuid,
                projectUuid,
            ),
            user.organizationUuid
                ? this.groupsModel.findUserGroups({
                      userUuid: user.userUuid,
                      organizationUuid: user.organizationUuid,
                  })
                : Promise.resolve([]),
            this.projectModel.getProjectMemberAccess(
                projectUuid,
                user.userUuid,
            ),
        ]);
        const published = await this.projectHomepageModel.resolvePublished(
            projectUuid,
            {
                groupUuids: groups.map((group) => group.uuid),
                role: membership?.role,
            },
        );
        // Personal choice wins unless the audience homepage disallows it
        if (override && (published?.allowPersonal ?? true)) {
            return { type: 'dashboard', dashboardUuid: override };
        }
        if (published) {
            return { type: 'homepage', homepage: published };
        }
        return null;
    }

    async setPersonalHomepage(
        user: SessionUser,
        projectUuid: string,
        dashboardUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        await this.projectHomepageModel.setPersonalOverride(
            user.userUuid,
            projectUuid,
            dashboardUuid,
        );
    }

    async clearPersonalHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        await this.projectHomepageModel.deletePersonalOverride(
            user.userUuid,
            projectUuid,
        );
    }

    async getPersonalHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<string | null> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        const override = await this.projectHomepageModel.getPersonalOverride(
            user.userUuid,
            projectUuid,
        );
        return override ?? null;
    }

    async getAssignments(
        user: SessionUser,
        projectUuid: string,
    ): Promise<HomepageAssignment[]> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        return this.projectHomepageModel.getAssignments(projectUuid);
    }

    async updateGroupPriorities(
        user: SessionUser,
        projectUuid: string,
        groupUuids: string[],
    ): Promise<void> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.projectHomepageModel.updateGroupPriorities(
            projectUuid,
            groupUuids,
        );
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
        audience: HomepageAudience,
        allowPersonal: boolean,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        return this.projectHomepageModel.publish(
            homepageUuid,
            audience,
            allowPersonal,
        );
    }
}
