import { subject } from '@casl/ability';
import {
    ApiContentActionBody,
    ApiContentBulkActionBody,
    assertUnreachable,
    ChartSourceType,
    ContentActionMove,
    ContentType,
    ForbiddenError,
    KnexPaginateArgs,
    KnexPaginatedData,
    NotExistsError,
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
import { BaseService } from '../BaseService';
import { DashboardService } from '../DashboardService/DashboardService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SavedSemanticViewerChartService } from '../SavedSemanticViewerChartService/SavedSemanticViewerChartService';
import { SavedSqlService } from '../SavedSqlService/SavedSqlService';
import {
    hasViewAccessToSpace,
    SpaceService,
} from '../SpaceService/SpaceService';

type ContentServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    contentModel: ContentModel;
    spaceModel: SpaceModel;
    spaceService: SpaceService;
    dashboardService: DashboardService;
    savedChartService: SavedChartService;
    savedSqlService: SavedSqlService;
    savedSemanticViewerChartService: SavedSemanticViewerChartService;
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

    savedSemanticViewerChartService: SavedSemanticViewerChartService;

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
        this.savedSemanticViewerChartService =
            args.savedSemanticViewerChartService;
    }

    async find(
        user: SessionUser,
        filters: ContentFilters,
        queryArgs: ContentArgs,
        paginateArgs: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<SummaryContent[]>> {
        const { organizationUuid } = user;
        if (organizationUuid === undefined) {
            throw new NotExistsError('Organization not found');
        }
        const projectUuids = (
            await this.projectModel.getAllByOrganizationUuid(organizationUuid)
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
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((p) => p.uuid),
        );
        const allowedSpaceUuids = spaces
            .filter((space) =>
                hasViewAccessToSpace(
                    user,
                    space,
                    spacesAccess[space.uuid] ?? [],
                ),
            )
            .map((space) => space.uuid);

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
            throw new NotExistsError('Organization not found');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
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
                            case ChartSourceType.SEMANTIC_LAYER:
                                return this.savedSemanticViewerChartService.moveToSpace(
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
            throw new NotExistsError('Organization not found');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
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
                    case ChartSourceType.SEMANTIC_LAYER:
                        return this.savedSemanticViewerChartService.moveToSpace(
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
}
