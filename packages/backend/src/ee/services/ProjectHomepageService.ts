import { subject } from '@casl/ability';
import {
    assertUnreachable,
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
    type HomepageLinkMetadata,
    type HomepageRecentlyViewedItem,
    type HomepageViewAsResult,
    type HomepageViewAsTarget,
    type ProjectHomepage,
    type ProjectMemberRole,
    type ResolvedHomepage,
    type SessionUser,
    type UpdateProjectHomepageDraftRequest,
} from '@lightdash/common';
import { type GroupsModel } from '../../models/GroupsModel';
import { type ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../services/BaseService';
import { type FeatureFlagService } from '../../services/FeatureFlag/FeatureFlagService';
import { secureFetch } from '../../utils/secureFetch/secureFetch';
import { type ProjectHomepageModel } from '../models/ProjectHomepageModel';
import {
    classifyResourceUrl,
    parseOpenGraph,
    parseYoutubeOembed,
} from './homepageLinkMetadata';

const LINK_METADATA_TIMEOUT_MS = 5_000;
const LINK_METADATA_MAX_BYTES = 256 * 1024;
// Some providers (e.g. claude.ai) only server-render per-page OpenGraph tags for
// recognised link-unfurl crawlers, so identify as one while staying honest about
// who we are.
const LINK_PREVIEW_USER_AGENT =
    'Lightdash-LinkPreview/1.0 (+https://www.lightdash.com; like Slackbot-LinkExpanding)';

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
        | 'discardDraft'
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
    private async resolveForViewer(
        projectUuid: string,
        viewer: {
            groupUuids: string[];
            role: ProjectMemberRole | undefined;
            personalOverride: string | undefined;
        },
    ): Promise<HomepageViewAsResult> {
        const published = await this.projectHomepageModel.resolvePublished(
            projectUuid,
            { groupUuids: viewer.groupUuids, role: viewer.role },
        );
        // Personal choice wins unless the audience homepage disallows it
        if (
            viewer.personalOverride &&
            (published?.homepage.allowPersonal ?? true)
        ) {
            return {
                resolved: {
                    type: 'dashboard',
                    dashboardUuid: viewer.personalOverride,
                },
                reason: {
                    type: 'personal',
                    dashboardUuid: viewer.personalOverride,
                },
            };
        }
        if (published) {
            return {
                resolved: { type: 'homepage', homepage: published.homepage },
                reason: published.source,
            };
        }
        return { resolved: null, reason: null };
    }

    private async getViewerContext(
        organizationUuid: string | undefined,
        projectUuid: string,
        userUuid: string,
    ): Promise<{
        groupUuids: string[];
        role: ProjectMemberRole | undefined;
        personalOverride: string | undefined;
    }> {
        const [override, groups, membership] = await Promise.all([
            this.projectHomepageModel.getPersonalOverride(
                userUuid,
                projectUuid,
            ),
            organizationUuid
                ? this.groupsModel.findUserGroups({
                      userUuid,
                      organizationUuid,
                  })
                : Promise.resolve([]),
            this.projectModel.getProjectMemberAccess(projectUuid, userUuid),
        ]);
        return {
            groupUuids: groups.map((group) => group.uuid),
            role: membership?.role,
            personalOverride: override,
        };
    }

    async getResolvedHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ResolvedHomepage | null> {
        await this.assertFlagEnabled(user);
        this.assertCanView(user, projectUuid);
        const viewer = await this.getViewerContext(
            user.organizationUuid,
            projectUuid,
            user.userUuid,
        );
        const { resolved } = await this.resolveForViewer(projectUuid, viewer);
        return resolved;
    }

    async viewAsHomepage(
        user: SessionUser,
        projectUuid: string,
        target: HomepageViewAsTarget,
    ): Promise<HomepageViewAsResult> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        switch (target.type) {
            case 'user': {
                const viewer = await this.getViewerContext(
                    user.organizationUuid,
                    projectUuid,
                    target.userUuid,
                );
                return this.resolveForViewer(projectUuid, viewer);
            }
            case 'group':
                return this.resolveForViewer(projectUuid, {
                    groupUuids: [target.groupUuid],
                    role: undefined,
                    personalOverride: undefined,
                });
            case 'role':
                return this.resolveForViewer(projectUuid, {
                    groupUuids: [],
                    role: target.role,
                    personalOverride: undefined,
                });
            default:
                return assertUnreachable(target, 'Unknown view-as target type');
        }
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

    async discardDraft(
        user: SessionUser,
        projectUuid: string,
        homepageUuid: string,
    ): Promise<ProjectHomepage> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);
        await this.getOwnedHomepage(projectUuid, homepageUuid);
        return this.projectHomepageModel.discardDraft(homepageUuid);
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

    /**
     * Unfurl a pasted resource URL for the homepage builder. Rejects any host
     * outside the allowlist (400); for allowed hosts, returns the detected kind
     * with title/description/imageUrl (nulls if the fetch or parse fails, so the
     * author can still add the item and type a title). The outbound fetch is
     * SSRF-hardened (https-only, private-IP blocking, redirect + size + time
     * caps) via the shared `secureFetch` util.
     */
    async fetchLinkMetadata(
        user: SessionUser,
        projectUuid: string,
        url: string,
    ): Promise<HomepageLinkMetadata> {
        await this.assertFlagEnabled(user);
        this.assertCanManage(user, projectUuid);

        const provider = classifyResourceUrl(url);
        try {
            if (provider.fetchKind === 'oembed') {
                const { bodyText } = await secureFetch(provider.fetchUrl, {
                    method: 'GET',
                    timeoutMs: LINK_METADATA_TIMEOUT_MS,
                    maxResponseBytes: LINK_METADATA_MAX_BYTES,
                    allowedContentTypes: ['application/json'],
                    headers: { 'User-Agent': LINK_PREVIEW_USER_AGENT },
                });
                let json: unknown = null;
                try {
                    json = JSON.parse(bodyText);
                } catch {
                    json = null;
                }
                return { kind: provider.kind, ...parseYoutubeOembed(json) };
            }
            const { bodyText } = await secureFetch(provider.fetchUrl, {
                method: 'GET',
                timeoutMs: LINK_METADATA_TIMEOUT_MS,
                maxResponseBytes: LINK_METADATA_MAX_BYTES,
                allowedContentTypes: ['text/html'],
                headers: { 'User-Agent': LINK_PREVIEW_USER_AGENT },
            });
            return { kind: provider.kind, ...parseOpenGraph(bodyText) };
        } catch {
            return {
                kind: provider.kind,
                title: null,
                description: null,
                imageUrl: null,
            };
        }
    }
}
