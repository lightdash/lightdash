import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ContentType,
    ForbiddenError,
    ResourceViewItemType,
    type FavoriteItems,
    type ResourceViewSpaceItem,
    type SessionUser,
    type ToggleFavoriteResponse,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserFavoritesModel } from '../../models/UserFavoritesModel';
import { BaseService } from '../BaseService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type FavoritesServiceArguments = {
    analytics: LightdashAnalytics;
    userFavoritesModel: UserFavoritesModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    spacePermissionService: SpacePermissionService;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
};

export class FavoritesService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly userFavoritesModel: UserFavoritesModel;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly savedChartModel: SavedChartModel;

    private readonly dashboardModel: DashboardModel;

    constructor({
        analytics,
        userFavoritesModel,
        projectModel,
        spaceModel,
        spacePermissionService,
        savedChartModel,
        dashboardModel,
    }: FavoritesServiceArguments) {
        super();
        this.analytics = analytics;
        this.userFavoritesModel = userFavoritesModel;
        this.projectModel = projectModel;
        this.spaceModel = spaceModel;
        this.spacePermissionService = spacePermissionService;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
    }

    async toggleFavorite(
        user: SessionUser,
        projectUuid: string,
        contentType: ContentType,
        contentUuid: string,
    ): Promise<ToggleFavoriteResponse> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }

        // Verify the user has permission to view the content they're trying to favorite
        let spaceUuid: string;
        switch (contentType) {
            case ContentType.SPACE:
                spaceUuid = contentUuid;
                break;
            case ContentType.CHART: {
                const chart = await this.savedChartModel.get(contentUuid);
                spaceUuid = chart.spaceUuid;
                break;
            }
            case ContentType.DASHBOARD: {
                const dashboard =
                    await this.dashboardModel.getByIdOrSlug(contentUuid);
                spaceUuid = dashboard.spaceUuid;
                break;
            }
            default:
                return assertUnreachable(
                    contentType,
                    `Unknown content type: ${contentType}`,
                );
        }

        const canViewSpace = await this.spacePermissionService.can(
            'view',
            user,
            spaceUuid,
        );
        if (!canViewSpace) {
            throw new ForbiddenError();
        }

        const alreadyFavorited = await this.userFavoritesModel.isFavorite(
            user.userUuid,
            contentType,
            contentUuid,
        );

        if (alreadyFavorited) {
            await this.userFavoritesModel.removeFavorite(
                user.userUuid,
                contentType,
                contentUuid,
            );
        } else {
            await this.userFavoritesModel.addFavorite(
                user.userUuid,
                projectUuid,
                contentType,
                contentUuid,
            );
        }

        const isFavorite = !alreadyFavorited;

        this.analytics.track({
            event: 'favorite.toggled',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: user.organizationUuid ?? '',
                contentType,
                isFavorite,
            },
        });

        return {
            isFavorite,
            contentType,
            contentUuid,
        };
    }

    async getFavorites(
        user: SessionUser,
        projectUuid: string,
    ): Promise<FavoriteItems> {
        const project = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spaceUuids = spaces.map((s) => s.uuid);
        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            );

        const favoriteRows = await this.userFavoritesModel.getFavoriteUuids(
            user.userUuid,
            projectUuid,
        );

        if (favoriteRows.length === 0) {
            return [];
        }

        const chartUuids = favoriteRows
            .filter((r) => r.contentType === ContentType.CHART)
            .map((r) => r.contentUuid);
        const dashboardUuids = favoriteRows
            .filter((r) => r.contentType === ContentType.DASHBOARD)
            .map((r) => r.contentUuid);
        const favoriteSpaceUuids = favoriteRows
            .filter((r) => r.contentType === ContentType.SPACE)
            .map((r) => r.contentUuid);

        const [charts, dashboards, favSpaceBases] = await Promise.all([
            this.userFavoritesModel.getFavoriteCharts(
                projectUuid,
                chartUuids,
                allowedSpaceUuids,
            ),
            this.userFavoritesModel.getFavoriteDashboards(
                projectUuid,
                dashboardUuids,
                allowedSpaceUuids,
            ),
            this.userFavoritesModel.getFavoriteSpaces(
                projectUuid,
                favoriteSpaceUuids,
                allowedSpaceUuids,
            ),
        ]);

        // Enrich favorite spaces with access data from SpacePermissionService
        const favSpaceUuids = favSpaceBases.map((s) => s.data.uuid);
        const directAccessMap =
            await this.spacePermissionService.getDirectAccessUserUuids(
                favSpaceUuids,
            );
        const favSpaces: ResourceViewSpaceItem[] = favSpaceBases.map((item) => {
            const directAccessUuids = directAccessMap[item.data.uuid] ?? [];
            return {
                type: ResourceViewItemType.SPACE,
                data: {
                    ...item.data,
                    access: directAccessUuids,
                    accessListLength: directAccessUuids.length,
                },
            };
        });

        return [...favSpaces, ...dashboards, ...charts];
    }
}
