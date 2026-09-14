import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ContentType,
    DirectAccessResourceType,
    ForbiddenError,
    ParameterError,
    ResourceViewItemType,
    type FavoriteItems,
    type ResourceViewSpaceItem,
    type SessionUser,
    type ToggleFavoriteResponse,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { AppModel } from '../../models/AppModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { UserFavoritesModel } from '../../models/UserFavoritesModel';
import { BaseService } from '../BaseService';
import type { DirectAccessService } from '../DirectAccess/DirectAccessService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';

type FavoritesServiceArguments = {
    analytics: LightdashAnalytics;
    userFavoritesModel: UserFavoritesModel;
    projectModel: ProjectModel;
    spaceModel: SpaceModel;
    spacePermissionService: SpacePermissionService;
    directAccessService: DirectAccessService;
    savedChartModel: SavedChartModel;
    dashboardModel: DashboardModel;
    appModel: AppModel;
};

export class FavoritesService extends BaseService {
    private readonly analytics: LightdashAnalytics;

    private readonly userFavoritesModel: UserFavoritesModel;

    private readonly projectModel: ProjectModel;

    private readonly spaceModel: SpaceModel;

    private readonly spacePermissionService: SpacePermissionService;

    private readonly directAccessService: DirectAccessService;

    private readonly savedChartModel: SavedChartModel;

    private readonly dashboardModel: DashboardModel;

    private readonly appModel: AppModel;

    constructor({
        analytics,
        userFavoritesModel,
        projectModel,
        spaceModel,
        spacePermissionService,
        directAccessService,
        savedChartModel,
        dashboardModel,
        appModel,
    }: FavoritesServiceArguments) {
        super();
        this.analytics = analytics;
        this.userFavoritesModel = userFavoritesModel;
        this.projectModel = projectModel;
        this.spaceModel = spaceModel;
        this.spacePermissionService = spacePermissionService;
        this.directAccessService = directAccessService;
        this.savedChartModel = savedChartModel;
        this.dashboardModel = dashboardModel;
        this.appModel = appModel;
    }

    async toggleFavorite(
        user: SessionUser,
        projectUuid: string,
        contentType: ContentType,
        contentUuid: string,
    ): Promise<ToggleFavoriteResponse> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    ...project,
                    metadata: {
                        projectUuid: project.projectUuid,
                        projectName: project.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Verify the user has permission to view the content they're trying to
        // favorite; resource-aware access so directly granted content counts.
        // Resolve the canonical UUID from the entity since callers may pass a
        // slug — content_uuid is a uuid column and would reject a slug.
        let resolvedContentUuid: string;
        let canViewContent: boolean;
        switch (contentType) {
            case ContentType.SPACE:
                resolvedContentUuid = contentUuid;
                canViewContent = await this.spacePermissionService.can(
                    'view',
                    user,
                    contentUuid,
                );
                break;
            case ContentType.CHART: {
                const chart = await this.savedChartModel.get(contentUuid);
                resolvedContentUuid = chart.uuid;
                const context = await this.spacePermissionService.resolveAccess(
                    user.userUuid,
                    {
                        type: 'chart',
                        chartUuid: chart.uuid,
                        dashboardUuid: chart.dashboardUuid ?? null,
                        spaceUuid: chart.spaceUuid,
                    },
                );
                canViewContent = auditedAbility.can(
                    'view',
                    subject('SavedChart', {
                        ...context,
                        metadata: {
                            savedChartUuid: chart.uuid,
                            savedChartName: chart.name,
                        },
                    }),
                );
                break;
            }
            case ContentType.DASHBOARD: {
                const dashboard =
                    await this.dashboardModel.getByIdOrSlug(contentUuid);
                resolvedContentUuid = dashboard.uuid;
                const context = await this.spacePermissionService.resolveAccess(
                    user.userUuid,
                    {
                        type: 'dashboard',
                        dashboardUuid: dashboard.uuid,
                        spaceUuid: dashboard.spaceUuid,
                    },
                );
                canViewContent = auditedAbility.can(
                    'view',
                    subject('Dashboard', {
                        ...context,
                        metadata: {
                            dashboardUuid: dashboard.uuid,
                            dashboardName: dashboard.name,
                        },
                    }),
                );
                break;
            }
            case ContentType.DATA_APP: {
                const app = await this.appModel.getApp(
                    contentUuid,
                    projectUuid,
                );
                if (!app.space_uuid) {
                    // Personal apps aren't listed anywhere in the content UI,
                    // so there's no surface to unfavorite them from. Keep
                    // them out of favorites entirely.
                    throw new ParameterError(
                        'Personal data apps cannot be favorited',
                    );
                }
                resolvedContentUuid = app.app_id;
                const context = await this.spacePermissionService.resolveAccess(
                    user.userUuid,
                    {
                        type: 'app',
                        appUuid: app.app_id,
                        organizationUuid: project.organizationUuid,
                        projectUuid,
                        spaceUuid: app.space_uuid,
                    },
                );
                canViewContent = auditedAbility.can(
                    'view',
                    subject('DataApp', {
                        ...context,
                        createdByUserUuid: app.created_by_user_uuid,
                    }),
                );
                break;
            }
            default:
                return assertUnreachable(
                    contentType,
                    `Unknown content type: ${contentType}`,
                );
        }

        if (!canViewContent) {
            throw new ForbiddenError();
        }

        const alreadyFavorited = await this.userFavoritesModel.isFavorite(
            user.userUuid,
            contentType,
            resolvedContentUuid,
        );

        if (alreadyFavorited) {
            await this.userFavoritesModel.removeFavorite(
                user.userUuid,
                contentType,
                resolvedContentUuid,
            );
        } else {
            await this.userFavoritesModel.addFavorite(
                user.userUuid,
                projectUuid,
                contentType,
                resolvedContentUuid,
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
            contentUuid: resolvedContentUuid,
        };
    }

    async getFavorites(
        user: SessionUser,
        projectUuid: string,
    ): Promise<FavoriteItems> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    ...project,
                    metadata: {
                        projectUuid: project.projectUuid,
                        projectName: project.name,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spaceUuids = spaces.map((s) => s.uuid);
        const [allowedSpaceUuids, granted] = await Promise.all([
            this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaceUuids,
            ),
            // Directly granted content stays visible in the caller's own
            // favorites even without any space access path.
            user.organizationUuid
                ? this.directAccessService.findSharedWithMeUuids(
                      {
                          userUuid: user.userUuid,
                          organizationUuid: user.organizationUuid,
                      },
                      [projectUuid],
                  )
                : undefined,
        ]);

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
        const appUuids = favoriteRows
            .filter((r) => r.contentType === ContentType.DATA_APP)
            .map((r) => r.contentUuid);

        const [charts, dashboards, favSpaceBases, apps] = await Promise.all([
            this.userFavoritesModel.getFavoriteCharts(
                projectUuid,
                chartUuids,
                allowedSpaceUuids,
                granted?.[DirectAccessResourceType.CHART],
            ),
            this.userFavoritesModel.getFavoriteDashboards(
                projectUuid,
                dashboardUuids,
                allowedSpaceUuids,
                granted?.[DirectAccessResourceType.DASHBOARD],
            ),
            this.userFavoritesModel.getFavoriteSpaces(
                projectUuid,
                favoriteSpaceUuids,
                allowedSpaceUuids,
            ),
            this.userFavoritesModel.getFavoriteApps(
                projectUuid,
                appUuids,
                allowedSpaceUuids,
                granted?.[DirectAccessResourceType.APP],
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

        return [...favSpaces, ...dashboards, ...charts, ...apps];
    }
}
