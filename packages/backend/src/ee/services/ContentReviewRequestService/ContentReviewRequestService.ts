import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ConflictError,
    ContentReviewContentType,
    ContentReviewNotificationEvent,
    ContentReviewRequestStatus,
    ContentReviewRequestView,
    ContentType,
    DirectAccessPrincipalType,
    DirectAccessResourceType,
    ForbiddenError,
    getErrorMessage,
    isDashboardChartTileType,
    isDashboardSqlChartTile,
    NotFoundError,
    ParameterError,
    SpaceMemberRole,
    type ApproveContentReviewRequestBody,
    type ContentReviewGrantedPrincipal,
    type ContentReviewMovedItem,
    type ContentReviewRequest,
    type ContentReviewRequestDetail,
    type ContentReviewRequestListItem,
    type ContentReviewSettings,
    type ContentReviewSimilarContentItem,
    type CreateContentReviewRequestBody,
    type DirectAccessPrincipalRef,
    type KnexPaginateArgs,
    type KnexPaginatedData,
    type RejectContentReviewRequestBody,
    type SessionUser,
    type UpdateContentReviewSettings,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { type LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import Logger from '../../../logging/logger';
import {
    type ContentReviewContentLocation,
    type ContentReviewRequestModel,
    type ContentReviewSpaceInfo,
} from '../../../models/ContentReviewRequestModel';
import { type ContentReviewSettingsModel } from '../../../models/ContentReviewSettingsModel';
import { type ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { type DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { type DirectAccessModel } from '../../../models/DirectAccessModel';
import { type GroupsModel } from '../../../models/GroupsModel';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { type SpaceModel } from '../../../models/SpaceModel';
import { BaseService } from '../../../services/BaseService';
import { type DashboardService } from '../../../services/DashboardService/DashboardService';
import { type DirectAccessFeatureGate } from '../../../services/DirectAccess/DirectAccessFeatureGate';
import { type SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import { type SavedSqlService } from '../../../services/SavedSqlService/SavedSqlService';
import { type SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import { type ContentReviewNotificationService } from '../ContentReviewNotificationService/ContentReviewNotificationService';

type ContentReviewRequestServiceArguments = {
    analytics: LightdashAnalytics;
    contentReviewNotificationService: ContentReviewNotificationService;
    contentReviewRequestModel: ContentReviewRequestModel;
    contentReviewSettingsModel: ContentReviewSettingsModel;
    contentVerificationModel: ContentVerificationModel;
    dashboardModel: DashboardModel;
    dashboardService: DashboardService;
    directAccessFeatureGate: DirectAccessFeatureGate;
    directAccessModel: DirectAccessModel;
    groupsModel: GroupsModel;
    projectModel: ProjectModel;
    savedChartService: SavedChartService;
    savedSqlService: SavedSqlService;
    spaceModel: SpaceModel;
    spacePermissionService: SpacePermissionService;
};

type ProjectContext = { organizationUuid: string; projectUuid: string };

const SIMILAR_CANDIDATE_LIMIT = 20;
const SIMILAR_RESULT_LIMIT = 5;
const VERIFIED_SCORE_BOOST = 10;

type ContentLookups = {
    locations: Map<string, ContentReviewContentLocation>;
    spaces: Map<string, ContentReviewSpaceInfo>;
};

const toDirectAccessResourceType = (
    contentType: ContentReviewContentType,
): DirectAccessResourceType => {
    switch (contentType) {
        case ContentReviewContentType.CHART:
            return DirectAccessResourceType.CHART;
        case ContentReviewContentType.SQL_CHART:
            return DirectAccessResourceType.SQL_CHART;
        case ContentReviewContentType.DASHBOARD:
            return DirectAccessResourceType.DASHBOARD;
        default:
            return assertUnreachable(
                contentType,
                'Unsupported review content type',
            );
    }
};

export class ContentReviewRequestService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly contentReviewNotificationService: ContentReviewNotificationService;

    private readonly contentReviewRequestModel: ContentReviewRequestModel;

    private readonly contentReviewSettingsModel: ContentReviewSettingsModel;

    private readonly contentVerificationModel: ContentVerificationModel;

    private readonly dashboardModel: DashboardModel;

    private readonly dashboardService: DashboardService;

    private readonly directAccessFeatureGate: DirectAccessFeatureGate;

    private readonly directAccessModel: DirectAccessModel;

    private readonly groupsModel: GroupsModel;

    private readonly projectModel: ProjectModel;

    private readonly savedChartService: SavedChartService;

    private readonly savedSqlService: SavedSqlService;

    private readonly spaceModel: SpaceModel;

    private readonly spacePermissionService: SpacePermissionService;

    constructor(args: ContentReviewRequestServiceArguments) {
        super({ serviceName: 'ContentReviewRequestService' });
        this.analytics = args.analytics;
        this.contentReviewNotificationService =
            args.contentReviewNotificationService;
        this.contentReviewRequestModel = args.contentReviewRequestModel;
        this.contentReviewSettingsModel = args.contentReviewSettingsModel;
        this.contentVerificationModel = args.contentVerificationModel;
        this.dashboardModel = args.dashboardModel;
        this.dashboardService = args.dashboardService;
        this.directAccessFeatureGate = args.directAccessFeatureGate;
        this.directAccessModel = args.directAccessModel;
        this.groupsModel = args.groupsModel;
        this.projectModel = args.projectModel;
        this.savedChartService = args.savedChartService;
        this.savedSqlService = args.savedSqlService;
        this.spaceModel = args.spaceModel;
        this.spacePermissionService = args.spacePermissionService;
    }

    // Reviewers see personal-space content through direct-access grants, so
    // that flag is the switch for the whole loop
    async isEnabled(user: SessionUser): Promise<boolean> {
        return this.directAccessFeatureGate.isEnabledForUser({
            userUuid: user.userUuid,
            organizationUuid: user.organizationUuid,
        });
    }

    private async getProjectContext(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectContext> {
        if (!(await this.isEnabled(user))) {
            throw new ForbiddenError('Content review requests are not enabled');
        }
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            this.createAuditedAbility(user).cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return { organizationUuid, projectUuid };
    }

    private findLocations(
        contentType: ContentReviewContentType,
        contentUuids: string[],
    ): Promise<ContentReviewContentLocation[]> {
        switch (contentType) {
            case ContentReviewContentType.CHART:
                return this.contentReviewRequestModel.findChartLocations(
                    contentUuids,
                );
            case ContentReviewContentType.SQL_CHART:
                return this.contentReviewRequestModel.findSqlChartLocations(
                    contentUuids,
                );
            case ContentReviewContentType.DASHBOARD:
                return this.contentReviewRequestModel.findDashboardLocations(
                    contentUuids,
                );
            default:
                return assertUnreachable(
                    contentType,
                    'Unknown review content type',
                );
        }
    }

    private async getContentLocation(
        contentType: ContentReviewContentType,
        contentUuid: string,
    ): Promise<ContentReviewContentLocation> {
        const [location] = await this.findLocations(contentType, [contentUuid]);
        if (location === undefined || location.deleted) {
            throw new NotFoundError('Content not found');
        }
        return location;
    }

    private async getSpaceInfo(
        spaceUuid: string,
    ): Promise<ContentReviewSpaceInfo> {
        const space = (
            await this.contentReviewRequestModel.findSpaceInfo([spaceUuid])
        ).get(spaceUuid);
        if (space === undefined || space.deleted) {
            throw new NotFoundError('Space not found');
        }
        return space;
    }

    private async getPendingRequest(
        projectUuid: string,
        requestUuid: string,
    ): Promise<ContentReviewRequest> {
        const request =
            await this.contentReviewRequestModel.getByUuid(requestUuid);
        if (request.projectUuid !== projectUuid) {
            throw new NotFoundError('Review request not found');
        }
        if (request.status !== ContentReviewRequestStatus.PENDING) {
            throw new ConflictError('This request has already been decided');
        }
        return request;
    }

    // A dashboard brings the personal-space charts its tiles use; charts
    // saved inside the dashboard follow it automatically
    private async computeMoveSet(request: {
        contentType: ContentReviewContentType;
        contentUuid: string;
        sourceSpaceUuid: string;
    }): Promise<ContentReviewMovedItem[]> {
        const primary = await this.getContentLocation(
            request.contentType,
            request.contentUuid,
        );
        const items: ContentReviewMovedItem[] = [
            {
                contentType: request.contentType,
                contentUuid: primary.uuid,
                name: primary.name,
            },
        ];
        if (request.contentType !== ContentReviewContentType.DASHBOARD) {
            return items;
        }
        const dashboard = await this.dashboardModel.getByIdOrSlug(
            request.contentUuid,
        );
        const tileChartUuids = [
            ...new Set(
                dashboard.tiles
                    .filter(isDashboardChartTileType)
                    .flatMap((tile) =>
                        tile.properties.savedChartUuid
                            ? [tile.properties.savedChartUuid]
                            : [],
                    ),
            ),
        ];
        const charts =
            await this.contentReviewRequestModel.findChartLocations(
                tileChartUuids,
            );
        charts
            .filter(
                (chart) =>
                    !chart.deleted &&
                    chart.spaceUuid === request.sourceSpaceUuid,
            )
            .forEach((chart) => {
                items.push({
                    contentType: ContentReviewContentType.CHART,
                    contentUuid: chart.uuid,
                    name: chart.name,
                });
            });
        // SQL runner tiles travel with the dashboard the same way
        const tileSqlChartUuids = [
            ...new Set(
                dashboard.tiles
                    .filter(isDashboardSqlChartTile)
                    .flatMap((tile) =>
                        tile.properties.savedSqlUuid
                            ? [tile.properties.savedSqlUuid]
                            : [],
                    ),
            ),
        ];
        const sqlCharts =
            await this.contentReviewRequestModel.findSqlChartLocations(
                tileSqlChartUuids,
            );
        sqlCharts
            .filter(
                (chart) =>
                    !chart.deleted &&
                    chart.spaceUuid === request.sourceSpaceUuid,
            )
            .forEach((chart) => {
                items.push({
                    contentType: ContentReviewContentType.SQL_CHART,
                    contentUuid: chart.uuid,
                    name: chart.name,
                });
            });
        return items;
    }

    private async isReviewerGroupMember(
        user: SessionUser,
        settings: ContentReviewSettings,
        organizationUuid: string,
    ): Promise<boolean> {
        if (settings.reviewerGroupUuid === null) return false;
        const memberships = await this.groupsModel.findUserInGroups({
            userUuid: user.userUuid,
            organizationUuid,
            groupUuids: [settings.reviewerGroupUuid],
        });
        return memberships.length > 0;
    }

    // Reviewers are the configured group, otherwise whoever can edit the
    // target space. Either way the move needs update rights on the target.
    private async canReview(
        user: SessionUser,
        request: ContentReviewRequest,
        settings: ContentReviewSettings,
        organizationUuid: string,
    ): Promise<boolean> {
        if (request.targetSpaceUuid === null) return false;
        const canUpdateTarget = await this.spacePermissionService.can(
            'update',
            user,
            request.targetSpaceUuid,
        );
        if (!canUpdateTarget) return false;
        if (settings.reviewerGroupUuid === null) return true;
        return this.isReviewerGroupMember(user, settings, organizationUuid);
    }

    private moveItem(
        user: SessionUser,
        contentType: ContentReviewContentType,
        moveArgs: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string;
        },
        moveOptions: { tx: Knex; checkForAccess: boolean; trackEvent: boolean },
    ): Promise<unknown> {
        switch (contentType) {
            case ContentReviewContentType.CHART:
                return this.savedChartService.moveToSpace(
                    user,
                    moveArgs,
                    moveOptions,
                );
            case ContentReviewContentType.SQL_CHART:
                return this.savedSqlService.moveToSpace(
                    user,
                    moveArgs,
                    moveOptions,
                );
            case ContentReviewContentType.DASHBOARD:
                return this.dashboardService.moveToSpace(
                    user,
                    moveArgs,
                    moveOptions,
                );
            default:
                return assertUnreachable(
                    contentType,
                    'Unknown review content type',
                );
        }
    }

    // Verification only exists for explorer charts and dashboards today
    private static toVerifiableContentType(
        contentType: ContentReviewContentType,
    ): ContentType | null {
        switch (contentType) {
            case ContentReviewContentType.CHART:
                return ContentType.CHART;
            case ContentReviewContentType.DASHBOARD:
                return ContentType.DASHBOARD;
            case ContentReviewContentType.SQL_CHART:
                return null;
            default:
                return assertUnreachable(
                    contentType,
                    'Unknown review content type',
                );
        }
    }

    private canVerify(
        user: SessionUser,
        context: ProjectContext,
        contentType: ContentReviewContentType,
    ): boolean {
        if (
            ContentReviewRequestService.toVerifiableContentType(contentType) ===
            null
        ) {
            return false;
        }
        return this.createAuditedAbility(user).can(
            'manage',
            subject('ContentVerification', {
                organizationUuid: context.organizationUuid,
                projectUuid: context.projectUuid,
                metadata: { projectUuid: context.projectUuid },
            }),
        );
    }

    private async resolveReviewerPrincipals(
        settings: ContentReviewSettings,
        targetSpaceUuid: string,
        requesterUuid: string,
    ): Promise<DirectAccessPrincipalRef[]> {
        if (settings.reviewerGroupUuid !== null) {
            return [
                {
                    type: DirectAccessPrincipalType.GROUP,
                    uuid: settings.reviewerGroupUuid,
                },
            ];
        }
        const { data: access } =
            await this.spacePermissionService.getPaginatedSpaceAccess(
                targetSpaceUuid,
                {},
            );
        return access
            .filter(
                (share) =>
                    share.userUuid !== requesterUuid &&
                    (share.role === SpaceMemberRole.EDITOR ||
                        share.role === SpaceMemberRole.ADMIN),
            )
            .map((share) => ({
                type: DirectAccessPrincipalType.USER,
                uuid: share.userUuid,
            }));
    }

    private async grantReviewerAccess(
        moveSet: ContentReviewMovedItem[],
        principals: DirectAccessPrincipalRef[],
        organizationUuid: string,
        requesterUuid: string,
    ): Promise<ContentReviewGrantedPrincipal[]> {
        const granted: ContentReviewGrantedPrincipal[] = [];
        try {
            for (const item of moveSet) {
                const resourceType = toDirectAccessResourceType(
                    item.contentType,
                );
                for (const principal of principals) {
                    // Sequential on purpose: each grant locks the owner chain
                    // eslint-disable-next-line no-await-in-loop
                    await this.directAccessModel.upsertAccess({
                        resourceType,
                        resourceUuid: item.contentUuid,
                        principal,
                        role: SpaceMemberRole.VIEWER,
                        organizationUuid,
                        grantedByUserUuid: requesterUuid,
                    });
                    granted.push({
                        resourceType,
                        resourceUuid: item.contentUuid,
                        principal,
                    });
                }
            }
        } catch (error) {
            await this.revokeGrants(granted, organizationUuid);
            throw error;
        }
        return granted;
    }

    private async revokeGrants(
        grants: ContentReviewGrantedPrincipal[],
        organizationUuid: string,
    ): Promise<void> {
        for (const grant of grants) {
            // eslint-disable-next-line no-await-in-loop
            await this.directAccessModel.revokeAccess({
                resourceType: grant.resourceType,
                resourceUuid: grant.resourceUuid,
                principal: grant.principal,
                organizationUuid,
            });
        }
    }

    private async releaseRequestGrants(
        request: ContentReviewRequest,
        organizationUuid: string,
    ): Promise<void> {
        await this.revokeGrants(request.grantedPrincipals, organizationUuid);
        await this.contentReviewRequestModel.clearGrantedPrincipals(
            request.uuid,
        );
    }

    private async lookupContent(
        requests: ContentReviewRequest[],
    ): Promise<ContentLookups> {
        const uuidsOf = (contentType: ContentReviewContentType) =>
            requests
                .filter((r) => r.contentType === contentType)
                .map((r) => r.contentUuid);
        const chartUuids = uuidsOf(ContentReviewContentType.CHART);
        const sqlChartUuids = uuidsOf(ContentReviewContentType.SQL_CHART);
        const dashboardUuids = uuidsOf(ContentReviewContentType.DASHBOARD);
        const spaceUuids = [
            ...new Set(
                requests.flatMap((r) =>
                    r.targetSpaceUuid === null
                        ? [r.sourceSpaceUuid]
                        : [r.sourceSpaceUuid, r.targetSpaceUuid],
                ),
            ),
        ];
        const [charts, sqlCharts, dashboards, spaces] = await Promise.all([
            this.contentReviewRequestModel.findChartLocations(chartUuids),
            this.contentReviewRequestModel.findSqlChartLocations(sqlChartUuids),
            this.contentReviewRequestModel.findDashboardLocations(
                dashboardUuids,
            ),
            this.contentReviewRequestModel.findSpaceInfo(spaceUuids),
        ]);
        return {
            locations: new Map(
                [...charts, ...sqlCharts, ...dashboards].map((location) => [
                    location.uuid,
                    location,
                ]),
            ),
            spaces,
        };
    }

    private static toListItem(
        request: ContentReviewRequest,
        lookups: ContentLookups,
    ): ContentReviewRequestListItem {
        const location = lookups.locations.get(request.contentUuid);
        return {
            ...request,
            content:
                location === undefined || location.deleted
                    ? null
                    : { name: location.name, slug: location.slug },
            sourceSpaceName:
                lookups.spaces.get(request.sourceSpaceUuid)?.name ?? null,
            targetSpaceName:
                request.targetSpaceUuid === null
                    ? null
                    : (lookups.spaces.get(request.targetSpaceUuid)?.name ??
                      null),
        };
    }

    private async toDetail(
        user: SessionUser,
        context: ProjectContext,
        request: ContentReviewRequest,
        settings: ContentReviewSettings,
    ): Promise<ContentReviewRequestDetail> {
        const [lookups, canReview] = await Promise.all([
            this.lookupContent([request]),
            this.canReview(user, request, settings, context.organizationUuid),
        ]);
        const item = ContentReviewRequestService.toListItem(request, lookups);
        const moveSet =
            request.status === ContentReviewRequestStatus.PENDING &&
            item.content !== null
                ? await this.computeMoveSet(request)
                : request.movedContent;
        return {
            ...item,
            moveSet,
            canReview,
            canVerify: this.canVerify(user, context, request.contentType),
            verifyByDefault: settings.verifyOnApproveDefault,
        };
    }

    async submit(
        user: SessionUser,
        projectUuid: string,
        body: CreateContentReviewRequestBody,
    ): Promise<ContentReviewRequestDetail> {
        const context = await this.getProjectContext(user, projectUuid);

        const personalSpace = await this.spaceModel.findPersonalSpace(
            projectUuid,
            user.userId,
        );
        if (personalSpace === null) {
            throw new ForbiddenError(
                'You need a personal space in this project to request a review',
            );
        }

        const content = await this.getContentLocation(
            body.contentType,
            body.contentUuid,
        );
        if (content.spaceUuid !== personalSpace.uuid) {
            throw new ParameterError(
                'Only content in your personal space can be submitted for review',
            );
        }

        const targetSpace = await this.getSpaceInfo(body.targetSpaceUuid);
        if (
            targetSpace.projectUuid !== projectUuid ||
            targetSpace.isDefaultUserSpace
        ) {
            throw new ParameterError(
                'Choose a shared space in this project as the target',
            );
        }
        if (
            !(await this.spacePermissionService.can(
                'view',
                user,
                targetSpace.uuid,
            ))
        ) {
            throw new ForbiddenError(
                'You do not have access to the target space',
            );
        }

        const moveSet = await this.computeMoveSet({
            contentType: body.contentType,
            contentUuid: body.contentUuid,
            sourceSpaceUuid: personalSpace.uuid,
        });
        const pendingByType = await Promise.all(
            Object.values(ContentReviewContentType).map((contentType) =>
                this.contentReviewRequestModel.findPendingByContentUuids(
                    contentType,
                    moveSet
                        .filter((i) => i.contentType === contentType)
                        .map((i) => i.contentUuid),
                ),
            ),
        );
        if (pendingByType.some((pending) => pending.size > 0)) {
            throw new ConflictError(
                'This content is already waiting for review',
            );
        }

        const settings = await this.contentReviewSettingsModel.get(projectUuid);
        const principals = await this.resolveReviewerPrincipals(
            settings,
            targetSpace.uuid,
            user.userUuid,
        );
        const grantedPrincipals = await this.grantReviewerAccess(
            moveSet,
            principals,
            context.organizationUuid,
            user.userUuid,
        );

        let request: ContentReviewRequest;
        try {
            request = await this.contentReviewRequestModel.create({
                projectUuid,
                contentType: body.contentType,
                contentUuid: body.contentUuid,
                sourceSpaceUuid: personalSpace.uuid,
                targetSpaceUuid: targetSpace.uuid,
                requestedByUserUuid: user.userUuid,
                requestNote: body.note,
                similarContent: body.similarContent,
                grantedPrincipals,
            });
        } catch (error) {
            await this.revokeGrants(
                grantedPrincipals,
                context.organizationUuid,
            );
            throw error;
        }

        this.analytics.track({
            event: 'content_review_request.submitted',
            userId: user.userUuid,
            properties: {
                organizationId: context.organizationUuid,
                projectId: projectUuid,
                contentType: body.contentType,
                contentId: body.contentUuid,
                targetSpaceId: targetSpace.uuid,
                routedTo:
                    settings.reviewerGroupUuid === null
                        ? 'space_editors'
                        : 'group',
                reviewerCount: principals.length,
                movedItemCount: moveSet.length,
                similarContentShown: body.similarContent.length,
            },
        });

        const detail = await this.toDetail(user, context, request, settings);
        await this.notify(() =>
            this.contentReviewNotificationService.notifySubmitted({
                item: detail,
                settings,
                organizationUuid: context.organizationUuid,
            }),
        );
        return detail;
    }

    // A failed notification must not fail the request itself
    private async notify(send: () => Promise<void>): Promise<void> {
        try {
            await send();
        } catch (error) {
            Logger.error(
                `Content review notification failed: ${getErrorMessage(error)}`,
            );
        }
    }

    async list(
        user: SessionUser,
        projectUuid: string,
        filters: {
            view: ContentReviewRequestView;
            status: ContentReviewRequestStatus | null;
        },
        paginateArgs: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<ContentReviewRequestListItem[]>> {
        const context = await this.getProjectContext(user, projectUuid);
        const settings = await this.contentReviewSettingsModel.get(projectUuid);

        let requests: ContentReviewRequest[];
        switch (filters.view) {
            case ContentReviewRequestView.MINE: {
                const { data } = await this.contentReviewRequestModel.list({
                    projectUuid,
                    status: filters.status,
                    requestedByUserUuid: user.userUuid,
                    targetSpaceUuids: null,
                });
                requests = data;
                break;
            }
            case ContentReviewRequestView.TO_REVIEW: {
                const { data } = await this.contentReviewRequestModel.list({
                    projectUuid,
                    status: filters.status,
                    requestedByUserUuid: null,
                    targetSpaceUuids: null,
                });
                requests = await this.filterReviewable(
                    user,
                    data,
                    settings,
                    context.organizationUuid,
                );
                break;
            }
            default:
                return assertUnreachable(
                    filters.view,
                    'Unknown review request view',
                );
        }

        const offset = (paginateArgs.page - 1) * paginateArgs.pageSize;
        const page = requests.slice(offset, offset + paginateArgs.pageSize);
        const lookups = await this.lookupContent(page);
        return {
            data: page.map((request) =>
                ContentReviewRequestService.toListItem(request, lookups),
            ),
            pagination: {
                ...paginateArgs,
                totalResults: requests.length,
                totalPageCount: Math.ceil(
                    requests.length / paginateArgs.pageSize,
                ),
            },
        };
    }

    private async filterReviewable(
        user: SessionUser,
        requests: ContentReviewRequest[],
        settings: ContentReviewSettings,
        organizationUuid: string,
    ): Promise<ContentReviewRequest[]> {
        const withTarget = requests.filter(
            (r): r is ContentReviewRequest & { targetSpaceUuid: string } =>
                r.targetSpaceUuid !== null,
        );
        if (withTarget.length === 0) return [];
        if (
            settings.reviewerGroupUuid !== null &&
            !(await this.isReviewerGroupMember(
                user,
                settings,
                organizationUuid,
            ))
        ) {
            return [];
        }
        const updatable = new Set(
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'update',
                user,
                [...new Set(withTarget.map((r) => r.targetSpaceUuid))],
            ),
        );
        return withTarget.filter((r) => updatable.has(r.targetSpaceUuid));
    }

    async get(
        user: SessionUser,
        projectUuid: string,
        requestUuid: string,
    ): Promise<ContentReviewRequestDetail> {
        const context = await this.getProjectContext(user, projectUuid);
        const request =
            await this.contentReviewRequestModel.getByUuid(requestUuid);
        if (request.projectUuid !== projectUuid) {
            throw new NotFoundError('Review request not found');
        }
        const settings = await this.contentReviewSettingsModel.get(projectUuid);
        const detail = await this.toDetail(user, context, request, settings);
        if (
            request.requestedBy.userUuid !== user.userUuid &&
            !detail.canReview
        ) {
            throw new ForbiddenError(
                'You do not have permission to view this review request',
            );
        }
        return detail;
    }

    // For headers and badges: the open request on an item, if the caller
    // may see it
    async findPendingForContent(
        user: SessionUser,
        projectUuid: string,
        contentType: ContentReviewContentType,
        contentUuid: string,
    ): Promise<ContentReviewRequest | null> {
        const context = await this.getProjectContext(user, projectUuid);
        const request =
            await this.contentReviewRequestModel.findPendingByContent(
                contentType,
                contentUuid,
            );
        if (request === null || request.projectUuid !== projectUuid) {
            return null;
        }
        if (request.requestedBy.userUuid === user.userUuid) return request;
        const settings = await this.contentReviewSettingsModel.get(projectUuid);
        return (await this.canReview(
            user,
            request,
            settings,
            context.organizationUuid,
        ))
            ? request
            : null;
    }

    async approve(
        user: SessionUser,
        projectUuid: string,
        requestUuid: string,
        body: ApproveContentReviewRequestBody,
    ): Promise<ContentReviewRequestDetail> {
        const context = await this.getProjectContext(user, projectUuid);
        const request = await this.getPendingRequest(projectUuid, requestUuid);
        const settings = await this.contentReviewSettingsModel.get(projectUuid);
        if (
            !(await this.canReview(
                user,
                request,
                settings,
                context.organizationUuid,
            ))
        ) {
            throw new ForbiddenError(
                'You do not have permission to review this request',
            );
        }
        if (
            body.verify &&
            !this.canVerify(user, context, request.contentType)
        ) {
            throw new ForbiddenError(
                'You do not have permission to verify content',
            );
        }
        const { targetSpaceUuid } = request;
        if (targetSpaceUuid === null) {
            throw new ConflictError('The target space no longer exists');
        }

        const moveSet = await this.computeMoveSet(request);
        // Access was checked above against the target; the per-type move
        // would otherwise fail on the personal source space
        const approved = await this.contentReviewRequestModel.transaction(
            async (tx) => {
                for (const item of moveSet) {
                    const moveArgs = {
                        projectUuid,
                        itemUuid: item.contentUuid,
                        targetSpaceUuid,
                    };
                    const moveOptions = {
                        tx,
                        checkForAccess: false,
                        trackEvent: true,
                    };
                    // eslint-disable-next-line no-await-in-loop
                    await this.moveItem(
                        user,
                        item.contentType,
                        moveArgs,
                        moveOptions,
                    );
                }
                return this.contentReviewRequestModel.approve(
                    request.uuid,
                    {
                        reviewedByUserUuid: user.userUuid,
                        reviewNote: body.note,
                        verifiedOnApprove: body.verify,
                        movedContent: moveSet,
                    },
                    { tx },
                );
            },
        );

        const verifiableType =
            ContentReviewRequestService.toVerifiableContentType(
                request.contentType,
            );
        if (body.verify && verifiableType !== null) {
            await this.contentVerificationModel.verify(
                verifiableType,
                request.contentUuid,
                projectUuid,
                user.userUuid,
            );
        }
        await this.releaseRequestGrants(request, context.organizationUuid);

        this.analytics.track({
            event: 'content_review_request.approved',
            userId: user.userUuid,
            properties: {
                organizationId: context.organizationUuid,
                projectId: projectUuid,
                contentType: request.contentType,
                contentId: request.contentUuid,
                targetSpaceId: targetSpaceUuid,
                verified: body.verify,
                movedItemCount: moveSet.length,
                turnaroundSeconds: Math.round(
                    (Date.now() - request.createdAt.getTime()) / 1000,
                ),
            },
        });

        const detail = await this.toDetail(
            user,
            context,
            { ...approved, grantedPrincipals: [] },
            settings,
        );
        await this.notify(() =>
            this.contentReviewNotificationService.notifyDecided({
                item: detail,
                event: ContentReviewNotificationEvent.APPROVED,
                organizationUuid: context.organizationUuid,
                actorUserUuid: user.userUuid,
            }),
        );
        return detail;
    }

    async reject(
        user: SessionUser,
        projectUuid: string,
        requestUuid: string,
        body: RejectContentReviewRequestBody,
    ): Promise<ContentReviewRequestDetail> {
        const context = await this.getProjectContext(user, projectUuid);
        if (body.note.trim().length === 0) {
            throw new ParameterError(
                'Tell the requester why the request was rejected',
            );
        }
        const request = await this.getPendingRequest(projectUuid, requestUuid);
        const settings = await this.contentReviewSettingsModel.get(projectUuid);
        if (
            !(await this.canReview(
                user,
                request,
                settings,
                context.organizationUuid,
            ))
        ) {
            throw new ForbiddenError(
                'You do not have permission to review this request',
            );
        }

        const rejected = await this.contentReviewRequestModel.reject(
            request.uuid,
            { reviewedByUserUuid: user.userUuid, reviewNote: body.note },
        );
        await this.releaseRequestGrants(request, context.organizationUuid);

        this.analytics.track({
            event: 'content_review_request.rejected',
            userId: user.userUuid,
            properties: {
                organizationId: context.organizationUuid,
                projectId: projectUuid,
                contentType: request.contentType,
                contentId: request.contentUuid,
                targetSpaceId: request.targetSpaceUuid,
                turnaroundSeconds: Math.round(
                    (Date.now() - request.createdAt.getTime()) / 1000,
                ),
            },
        });

        const detail = await this.toDetail(
            user,
            context,
            { ...rejected, grantedPrincipals: [] },
            settings,
        );
        await this.notify(() =>
            this.contentReviewNotificationService.notifyDecided({
                item: detail,
                event: ContentReviewNotificationEvent.REJECTED,
                organizationUuid: context.organizationUuid,
                actorUserUuid: user.userUuid,
            }),
        );
        return detail;
    }

    async cancel(
        user: SessionUser,
        projectUuid: string,
        requestUuid: string,
    ): Promise<ContentReviewRequestDetail> {
        const context = await this.getProjectContext(user, projectUuid);
        const request = await this.getPendingRequest(projectUuid, requestUuid);
        if (request.requestedBy.userUuid !== user.userUuid) {
            throw new ForbiddenError(
                'Only the requester can cancel a review request',
            );
        }

        const cancelled = await this.contentReviewRequestModel.cancel(
            request.uuid,
        );
        await this.releaseRequestGrants(request, context.organizationUuid);

        this.analytics.track({
            event: 'content_review_request.cancelled',
            userId: user.userUuid,
            properties: {
                organizationId: context.organizationUuid,
                projectId: projectUuid,
                contentType: request.contentType,
                contentId: request.contentUuid,
                targetSpaceId: request.targetSpaceUuid,
            },
        });

        const settings = await this.contentReviewSettingsModel.get(projectUuid);
        return this.toDetail(
            user,
            context,
            { ...cancelled, grantedPrincipals: [] },
            settings,
        );
    }

    // Name lookalikes in shared spaces the caller can see, verified ones
    // first so the sanctioned version is easy to spot
    async findSimilarContent(
        user: SessionUser,
        projectUuid: string,
        params: {
            contentType: ContentReviewContentType;
            name: string;
            excludeContentUuid: string | null;
        },
    ): Promise<ContentReviewSimilarContentItem[]> {
        await this.getProjectContext(user, projectUuid);
        if (params.name.trim().length === 0) return [];
        const candidates =
            await this.contentReviewRequestModel.findSimilarByName({
                projectUuid,
                contentType: params.contentType,
                name: params.name,
                excludeContentUuid: params.excludeContentUuid,
                limit: SIMILAR_CANDIDATE_LIMIT,
            });
        if (candidates.length === 0) return [];
        const accessible = new Set(
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                [...new Set(candidates.map((c) => c.spaceUuid))],
            ),
        );
        const visible = candidates.filter((c) => accessible.has(c.spaceUuid));
        const verifiedByType = new Map<ContentReviewContentType, Set<string>>();
        await Promise.all(
            [...new Set(visible.map((c) => c.contentType))].map(
                async (candidateType) => {
                    const verifiableType =
                        ContentReviewRequestService.toVerifiableContentType(
                            candidateType,
                        );
                    if (verifiableType === null) return;
                    const verified =
                        await this.contentVerificationModel.getByContentUuids(
                            verifiableType,
                            visible
                                .filter((c) => c.contentType === candidateType)
                                .map((c) => c.uuid),
                        );
                    verifiedByType.set(candidateType, new Set(verified.keys()));
                },
            ),
        );
        return visible
            .map((c) => {
                const isVerified =
                    verifiedByType.get(c.contentType)?.has(c.uuid) ?? false;
                return {
                    contentType: c.contentType,
                    contentUuid: c.uuid,
                    name: c.name,
                    slug: c.slug,
                    spaceUuid: c.spaceUuid,
                    spaceName: c.spaceName,
                    isVerified,
                    score: c.score + (isVerified ? VERIFIED_SCORE_BOOST : 0),
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, SIMILAR_RESULT_LIMIT);
    }

    private assertCanManageSettings(
        user: SessionUser,
        context: ProjectContext,
    ): void {
        if (
            this.createAuditedAbility(user).cannot(
                'manage',
                subject('Project', {
                    organizationUuid: context.organizationUuid,
                    projectUuid: context.projectUuid,
                    metadata: { projectUuid: context.projectUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                'You do not have permission to manage review settings',
            );
        }
    }

    async getSettings(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ContentReviewSettings> {
        await this.getProjectContext(user, projectUuid);
        return this.contentReviewSettingsModel.get(projectUuid);
    }

    async updateSettings(
        user: SessionUser,
        projectUuid: string,
        update: UpdateContentReviewSettings,
    ): Promise<ContentReviewSettings> {
        const context = await this.getProjectContext(user, projectUuid);
        this.assertCanManageSettings(user, context);
        if (
            update.reviewerGroupUuid !== undefined &&
            update.reviewerGroupUuid !== null
        ) {
            const group = await this.groupsModel.getGroup(
                update.reviewerGroupUuid,
            );
            if (group.organizationUuid !== context.organizationUuid) {
                throw new NotFoundError('Group not found');
            }
        }
        return this.contentReviewSettingsModel.upsert(projectUuid, update);
    }
}
