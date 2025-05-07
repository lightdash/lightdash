import { subject } from '@casl/ability';
import {
    ApiContentBulkActionBody,
    assertUnreachable,
    ChartContent,
    ChartSourceType,
    ContentBulkActionMove,
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
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSemanticViewerChartModel } from '../../models/SavedSemanticViewerChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { BaseService } from '../BaseService';
import { hasViewAccessToSpace } from '../SpaceService/SpaceService';

type ContentServiceArguments = {
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    contentModel: ContentModel;
    spaceModel: SpaceModel;
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    savedSqlModel: SavedSqlModel;
    savedSemanticViewerChartModel: SavedSemanticViewerChartModel;
};

export class ContentService extends BaseService {
    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    contentModel: ContentModel;

    spaceModel: SpaceModel;

    savedChartModel: SavedChartModel;

    dashboardModel: DashboardModel;

    savedSqlModel: SavedSqlModel;

    savedSemanticViewerChartModel: SavedSemanticViewerChartModel;

    constructor(args: ContentServiceArguments) {
        super();
        this.analytics = args.analytics;
        this.projectModel = args.projectModel;
        this.contentModel = args.contentModel;
        this.spaceModel = args.spaceModel;
        this.dashboardModel = args.dashboardModel;
        this.savedChartModel = args.savedChartModel;
        this.savedSqlModel = args.savedSqlModel;
        this.savedSemanticViewerChartModel = args.savedSemanticViewerChartModel;
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
        content: ApiContentBulkActionBody<ContentBulkActionMove>['content'],
        newParentSpaceUuid: string,
    ) {
        const permissionChecks = content.map(async (item) => {
            switch (item.contentType) {
                case ContentType.SPACE:
                    const space = await this.spaceModel.getSpaceSummary(
                        item.uuid,
                    );

                    const spaceAccess =
                        await this.spaceModel.getUserSpaceAccess(
                            user.userUuid,
                            item.uuid,
                        );
                    if (
                        user.ability.cannot(
                            'manage',
                            subject('Space', {
                                ...space,
                                access: spaceAccess,
                            }),
                        )
                    ) {
                        throw new ForbiddenError();
                    }

                    return space;
                case ContentType.DASHBOARD:
                    const dashboard = await this.dashboardModel.getById(
                        item.uuid,
                    );

                    if (
                        user.ability.cannot(
                            'update',
                            subject('Dashboard', {
                                ...(await this.spaceModel.getSpaceSummary(
                                    dashboard.spaceUuid,
                                )),
                                access: await this.spaceModel.getUserSpaceAccess(
                                    user.userUuid,
                                    dashboard.spaceUuid,
                                ),
                            }),
                        )
                    ) {
                        throw new ForbiddenError();
                    }

                    return dashboard;
                case ContentType.CHART:
                    switch (item.source) {
                        case ChartSourceType.DBT_EXPLORE:
                            const chart = await this.savedChartModel.getSummary(
                                item.uuid,
                            );

                            const chartSpace =
                                await this.spaceModel.getSpaceSummary(
                                    chart.spaceUuid,
                                );
                            const access =
                                await this.spaceModel.getUserSpaceAccess(
                                    user.userUuid,
                                    chart.spaceUuid,
                                );

                            if (
                                user.ability.cannot(
                                    'update',
                                    subject('SavedChart', {
                                        organizationUuid:
                                            chart.organizationUuid,
                                        projectUuid,
                                        isPrivate: chartSpace.isPrivate,
                                        access,
                                    }),
                                )
                            ) {
                                throw new ForbiddenError();
                            }

                            return chart;

                        case ChartSourceType.SQL:
                            const sqlChart = await this.savedSqlModel.getByUuid(
                                item.uuid,
                                {
                                    projectUuid,
                                },
                            );

                            if (
                                user.ability.cannot(
                                    'update',
                                    subject('SavedSql', {
                                        projectUuid,
                                        organizationUuid:
                                            sqlChart.organization
                                                .organizationUuid,
                                    }),
                                )
                            ) {
                                throw new ForbiddenError();
                            }

                            return sqlChart;
                        case ChartSourceType.SEMANTIC_LAYER:
                            const semanticViewerChart =
                                await this.savedSemanticViewerChartModel.find({
                                    uuid: item.uuid,
                                    projectUuid,
                                });
                            if (
                                user.ability.cannot(
                                    'update',
                                    subject('SemanticViewer', {
                                        projectUuid,
                                    }),
                                )
                            ) {
                                throw new ForbiddenError();
                            }

                            return semanticViewerChart;
                        default:
                            return assertUnreachable(
                                item.source,
                                `Unknown chart source in bulk move: ${item.source}`,
                            );
                    }
                default:
                    return assertUnreachable(
                        item,
                        `Unknown content type in bulk move`,
                    );
            }
        });

        await Promise.all(permissionChecks);

        const database = this.contentModel.getDatabase();

        await database.transaction(async (trx) => {
            const updates = content.map((c) => {
                switch (c.contentType) {
                    case ContentType.CHART:
                        switch (c.source) {
                            case ChartSourceType.DBT_EXPLORE:
                                return this.savedChartModel.moveToSpace(
                                    {
                                        projectUuid,
                                        savedChartUuid: c.uuid,
                                        newParentSpaceUuid,
                                    },
                                    { trx },
                                );
                            case ChartSourceType.SQL:
                                return this.savedSqlModel.moveToSpace(
                                    {
                                        projectUuid,
                                        savedSqlUuid: c.uuid,
                                        newParentSpaceUuid,
                                    },
                                    { trx },
                                );
                            case ChartSourceType.SEMANTIC_LAYER:
                                return this.savedSemanticViewerChartModel.moveToSpace(
                                    {
                                        projectUuid,
                                        savedSemanticViewerChartUuid: c.uuid,
                                        newParentSpaceUuid,
                                    },
                                    { trx },
                                );
                            default:
                                return assertUnreachable(
                                    c.source,
                                    `Unknown chart source in bulk move: ${c.source}`,
                                );
                        }

                    case ContentType.DASHBOARD:
                        return this.dashboardModel.moveToSpace(
                            {
                                projectUuid,
                                dashboardUuid: c.uuid,
                                newParentSpaceUuid,
                            },
                            { trx },
                        );
                    case ContentType.SPACE:
                        return this.spaceModel.moveToSpace(
                            {
                                projectUuid,
                                spaceUuid: c.uuid,
                                newParentSpaceUuid,
                            },
                            { trx },
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
                newParentSpaceId: newParentSpaceUuid,
                contentCount: content.length,
            },
        });
    }
}
