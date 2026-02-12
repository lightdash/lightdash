import { subject } from '@casl/ability';
import {
    ApiContentActionBody,
    ApiContentBulkActionBody,
    assertUnreachable,
    ChartSourceType,
    ContentActionMove,
    ContentType,
    DeletedContentFilters,
    DeletedContentItem,
    DeletedContentSummary,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotFoundError,
    SessionUser,
    SummaryContent,
} from '@lightdash/common';
import { intersection } from 'lodash';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import {
    ContentArgs,
    ContentFilters,
} from '../../models/ContentModel/ContentModelTypes';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../models/SpaceModel';
import { wrapSentryTransaction } from '../../utils';
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SavedSqlService } from '../SavedSqlService/SavedSqlService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { SpaceService } from '../SpaceService/SpaceService';

type ContentServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    contentModel: ContentModel;
    spaceModel: SpaceModel;
    spaceService: SpaceService;
    dashboardService: DashboardService;
    savedChartService: SavedChartService;
    savedSqlService: SavedSqlService;
    spacePermissionService: SpacePermissionService;
};

export class ContentService extends BaseService {
    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    contentModel: ContentModel;

    spaceModel: SpaceModel;

    spaceService: SpaceService;

    dashboardService: DashboardService;

    savedChartService: SavedChartService;

    savedSqlService: SavedSqlService;

    spacePermissionService: SpacePermissionService;

    constructor(args: ContentServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.contentModel = args.contentModel;

        this.spaceModel = args.spaceModel;

        this.spaceService = args.spaceService;
        this.dashboardService = args.dashboardService;
        this.savedChartService = args.savedChartService;
        this.savedSqlService = args.savedSqlService;
        this.spacePermissionService = args.spacePermissionService;
    }

    async find(
        user: SessionUser,
        filters: ContentFilters,
        queryArgs: ContentArgs,
        paginateArgs: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<SummaryContent[]>> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }
        const projectUuids = (
            await wrapSentryTransaction(
                'ContentService.find.getAllByOrganizationUuid',
                { organizationUuid },
                async () =>
                    this.projectModel.getAllByOrganizationUuid(
                        organizationUuid,
                    ),
            )
        )
            .filter((project) =>
                user.ability.can(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                    }),
                ),
            )
            .map((p) => p.projectUuid);
        const allowedProjectUuids = filters.projectUuids
            ? intersection(filters.projectUuids, projectUuids)
            : projectUuids; // todo: move this filter to project model query

        const spaces = await this.spaceModel.find({
            projectUuids: allowedProjectUuids,
            spaceUuids: filters.spaceUuids,
        });
        const spaceUuids = spaces.map((p) => p.uuid);

        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            );

        return this.contentModel.findSummaryContents(
            {
                ...filters,
                projectUuids: allowedProjectUuids,
                spaceUuids: allowedSpaceUuids,
                space: {
                    rootSpaces:
                        !filters.spaceUuids || filters.spaceUuids.length === 0,
                },
            },
            queryArgs,
            paginateArgs,
        );
    }

    async bulkMove(
        user: SessionUser,
        projectUuid: string,
        content: ApiContentBulkActionBody<ContentActionMove>['content'],
        targetSpaceUuid: string | null,
    ) {
        if (user.organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const database = this.contentModel.getDatabase();

        await database.transaction(async (tx) => {
            const updates = content.map((c) => {
                const moveToSpaceArgs = {
                    projectUuid,
                    itemUuid: c.uuid,
                    targetSpaceUuid,
                };

                const moveToSpaceOptions = {
                    tx,
                    checkForAccess: true,
                    trackEvent: false,
                };

                switch (c.contentType) {
                    case ContentType.CHART:
                        switch (c.source) {
                            case ChartSourceType.DBT_EXPLORE:
                                return this.savedChartService.moveToSpace(
                                    user,
                                    moveToSpaceArgs,
                                    moveToSpaceOptions,
                                );
                            case ChartSourceType.SQL:
                                return this.savedSqlService.moveToSpace(
                                    user,
                                    moveToSpaceArgs,
                                    moveToSpaceOptions,
                                );
                            default:
                                return assertUnreachable(
                                    c.source,
                                    `Unknown chart source in bulk move: ${c.source}`,
                                );
                        }

                    case ContentType.DASHBOARD:
                        return this.dashboardService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    case ContentType.SPACE:
                        return this.spaceService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    default:
                        return assertUnreachable(c, 'Unknown content type');
                }
            });

            await Promise.all(updates);
        });

        this.analytics.track({
            event: 'content.bulk_move',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                targetSpaceId: targetSpaceUuid,
                contentCount: content.length,
            },
        });
    }

    async move(
        user: SessionUser,
        projectUuid: string,
        item: ApiContentActionBody<ContentActionMove>['item'],
        targetSpaceUuid: string | null,
    ) {
        if (user.organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const moveToSpaceArgs = {
            projectUuid,
            itemUuid: item.uuid,
            targetSpaceUuid,
        };

        const moveToSpaceOptions = {
            checkForAccess: true,
            trackEvent: true,
        };

        switch (item.contentType) {
            case ContentType.CHART:
                switch (item.source) {
                    case ChartSourceType.DBT_EXPLORE:
                        return this.savedChartService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    case ChartSourceType.SQL:
                        return this.savedSqlService.moveToSpace(
                            user,
                            moveToSpaceArgs,
                            moveToSpaceOptions,
                        );
                    default:
                        return assertUnreachable(
                            item.source,
                            `Unknown chart source in bulk move: ${item.source}`,
                        );
                }

            case ContentType.DASHBOARD:
                return this.dashboardService.moveToSpace(
                    user,
                    moveToSpaceArgs,
                    moveToSpaceOptions,
                );
            case ContentType.SPACE:
                return this.spaceService.moveToSpace(
                    user,
                    moveToSpaceArgs,
                    moveToSpaceOptions,
                );
            default:
                return assertUnreachable(item, 'Unknown content type');
        }
    }

    /**
     * Find deleted content in a project using the ContentModel UNION approach.
     */
    async findDeleted(
        user: SessionUser,
        filters: DeletedContentFilters,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<DeletedContentSummary[]>> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }

        const [projectUuid] = filters.projectUuids;
        if (!projectUuid) {
            throw new NotFoundError('Project UUID is required');
        }

        // Check project access
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Non-admins can only see their own deleted content
        const isAdmin = user.ability.can(
            'manage',
            subject('DeletedContent', { organizationUuid, projectUuid }),
        );
        const deletedByUserUuids = isAdmin
            ? filters.deletedByUserUuids
            : [user.userUuid];

        const contentTypes = filters.contentTypes ?? [
            ContentType.CHART,
            ContentType.DASHBOARD,
            ContentType.SPACE,
        ];

        return this.contentModel.findDeletedContents(
            {
                projectUuids: [projectUuid],
                contentTypes,
                search: filters.search,
                deletedByUserUuids,
            },
            paginateArgs,
        );
    }

    /**
     * Restore deleted content
     */
    async restoreContent(
        user: SessionUser,
        projectUuid: string,
        item: DeletedContentItem,
    ): Promise<void> {
        if (user.organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        switch (item.contentType) {
            case ContentType.CHART:
                switch (item.source) {
                    case ChartSourceType.DBT_EXPLORE:
                        return this.savedChartService.restoreChart(
                            user,
                            item.uuid,
                        );
                    case ChartSourceType.SQL:
                        return this.savedSqlService.restoreSqlChart(
                            user,
                            item.uuid,
                        );
                    default:
                        return assertUnreachable(
                            item.source,
                            `Unknown chart source: ${item.source}`,
                        );
                }
            case ContentType.DASHBOARD:
                return this.dashboardService.restoreDashboard(user, item.uuid);
            case ContentType.SPACE:
                return this.spaceService.restoreSpace(user, item.uuid);
            default:
                return assertUnreachable(item, 'Unknown content type');
        }
    }

    /**
     * Permanently delete content
     */
    async permanentlyDeleteContent(
        user: SessionUser,
        projectUuid: string,
        item: DeletedContentItem,
    ): Promise<void> {
        if (user.organizationUuid === undefined) {
            throw new NotFoundError('Organization not found');
        }

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        switch (item.contentType) {
            case ContentType.CHART:
                switch (item.source) {
                    case ChartSourceType.DBT_EXPLORE:
                        return this.savedChartService.permanentlyDeleteChart(
                            user,
                            item.uuid,
                        );
                    case ChartSourceType.SQL:
                        return this.savedSqlService.permanentlyDeleteSqlChart(
                            user,
                            item.uuid,
                        );
                    default:
                        return assertUnreachable(
                            item.source,
                            `Unknown chart source: ${item.source}`,
                        );
                }
            case ContentType.DASHBOARD:
                return this.dashboardService.permanentlyDeleteDashboard(
                    user,
                    item.uuid,
                );
            case ContentType.SPACE:
                return this.spaceService.permanentlyDeleteSpace(
                    user,
                    item.uuid,
                );
            default:
                return assertUnreachable(item, 'Unknown content type');
        }
    }
}
