import {
    defineUserAbility,
    OrganizationMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { SearchService } from './SearchService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';

const user = {
    userUuid: 'user-uuid',
    ability: defineUserAbility(
        {
            role: OrganizationMemberRole.ADMIN,
            organizationUuid,
            userUuid: 'user-uuid',
            roleUuid: undefined,
        },
        [],
    ),
} as unknown as SessionUser;

const makeDataApp = () => ({
    uuid: 'app-uuid',
    slug: 'sales-forecast',
    name: 'Sales forecast',
    description: 'Forecast revenue by region',
    spaceUuid: null,
    projectUuid,
    search_rank: 0.8,
    viewsCount: 12,
    createdBy: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        userUuid: 'user-uuid',
    },
});

const makeService = ({ dataAppsEnabled = true } = {}) => {
    const dataApp = makeDataApp();
    const searchModel = {
        searchDashboards: vi.fn().mockResolvedValue([]),
        searchAllCharts: vi.fn().mockResolvedValue([]),
        searchDataApps: vi.fn().mockResolvedValue([dataApp]),
    };
    const appGenerateService = {
        dataAppsEnabledFor: vi.fn().mockResolvedValue(dataAppsEnabled),
        filterAppsUserCanView: vi.fn().mockResolvedValue([dataApp]),
    };
    const service = new SearchService({
        analytics: {} as never,
        searchModel: searchModel as never,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid,
                name: 'Project',
            }),
        } as never,
        spaceModel: {} as never,
        userAttributesModel: {} as never,
        spacePermissionService: {
            resolveAccessBatch: vi.fn().mockResolvedValue([]),
        } as never,
        appGenerateService: appGenerateService as never,
    });

    return { service, searchModel, appGenerateService, dataApp };
};

describe('SearchService.findContent', () => {
    it('uses OR search and established Data App authorization', async () => {
        const { service, searchModel, appGenerateService, dataApp } =
            makeService();

        await expect(
            service.findContent(user, projectUuid, 'forecast revenue', true),
        ).resolves.toEqual({
            content: [{ ...dataApp, contentType: 'data_app' }],
        });
        expect(searchModel.searchDataApps).toHaveBeenCalledWith(
            projectUuid,
            'forecast revenue',
            undefined,
            { fullTextSearchOperator: 'OR' },
        );
        expect(searchModel.searchDashboards).toHaveBeenCalledWith(
            projectUuid,
            'forecast revenue',
            undefined,
            { fullTextSearchOperator: 'OR', verifiedOnly: true },
        );
        expect(searchModel.searchAllCharts).toHaveBeenCalledWith(
            projectUuid,
            'forecast revenue',
            { fullTextSearchOperator: 'OR', verifiedOnly: true },
        );
        expect(appGenerateService.filterAppsUserCanView).toHaveBeenCalledWith(
            user,
            organizationUuid,
            projectUuid,
            [dataApp],
        );
    });

    it('does not search Data Apps when the feature is disabled', async () => {
        const { service, searchModel, appGenerateService } = makeService({
            dataAppsEnabled: false,
        });

        await expect(
            service.findContent(user, projectUuid, 'forecast revenue', false),
        ).resolves.toEqual({ content: [] });
        expect(searchModel.searchDataApps).not.toHaveBeenCalled();
        expect(appGenerateService.filterAppsUserCanView).not.toHaveBeenCalled();
    });
});

describe('SearchService resource-aware access', () => {
    const directViewer = {
        userUuid: 'direct-user-uuid',
        ability: defineUserAbility(
            {
                role: OrganizationMemberRole.INTERACTIVE_VIEWER,
                organizationUuid,
                userUuid: 'direct-user-uuid',
                roleUuid: undefined,
            },
            [],
        ),
    } as unknown as SessionUser;

    const grantOnlyContext = {
        organizationUuid,
        projectUuid,
        inheritsFromOrgOrProject: false,
        access: [
            {
                userUuid: 'direct-user-uuid',
                role: 'viewer',
                hasDirectAccess: true,
                grantedVia: 'dashboard',
            },
        ],
        admins: [],
        directOnly: true,
    };

    it('findContent surfaces directly granted dashboards through resource targets', async () => {
        const dashboard = {
            uuid: 'dashboard-uuid',
            name: 'Granted dashboard',
            spaceUuid: 'private-space-uuid',
            projectUuid,
            charts: [],
        };
        const resolveAccessBatch = vi.fn().mockResolvedValue([
            {
                target: {
                    type: 'dashboard',
                    dashboardUuid: 'dashboard-uuid',
                    spaceUuid: 'private-space-uuid',
                },
                context: grantOnlyContext,
            },
        ]);
        const grantedService = new SearchService({
            analytics: {} as never,
            searchModel: {
                searchDashboards: vi.fn().mockResolvedValue([dashboard]),
                searchAllCharts: vi.fn().mockResolvedValue([]),
                searchDataApps: vi.fn(),
            } as never,
            projectModel: {
                getSummary: vi.fn().mockResolvedValue({
                    organizationUuid,
                    name: 'Project',
                }),
            } as never,
            spaceModel: {} as never,
            userAttributesModel: {} as never,
            spacePermissionService: { resolveAccessBatch } as never,
            appGenerateService: undefined,
        });

        await expect(
            grantedService.findContent(
                directViewer,
                projectUuid,
                'granted',
                false,
            ),
        ).resolves.toEqual({
            content: [{ ...dashboard, contentType: 'dashboard' }],
        });
        expect(resolveAccessBatch).toHaveBeenCalledWith('direct-user-uuid', [
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-uuid',
                spaceUuid: 'private-space-uuid',
            },
        ]);
    });

    it('getSearchResults builds per-resource targets and drops spaceless sql rows', async () => {
        const searchResults = {
            spaces: [],
            dashboards: [
                {
                    uuid: 'dashboard-uuid',
                    name: 'Granted dashboard',
                    spaceUuid: 'private-space-uuid',
                },
            ],
            dashboardTabs: [],
            savedCharts: [
                {
                    uuid: 'chart-uuid',
                    name: 'Owned chart',
                    dashboardUuid: 'dashboard-uuid',
                    spaceUuid: 'private-space-uuid',
                },
            ],
            sqlCharts: [
                {
                    uuid: 'sql-owned-uuid',
                    name: 'Dashboard-owned sql',
                    dashboardUuid: 'dashboard-uuid',
                    spaceUuid: null,
                },
            ],
            fields: [],
            tables: [],
            pages: [],
            dataApps: [],
        };
        const resolveAccessBatch = vi.fn(async (_userUuid, targets) =>
            targets.map((target: unknown) => ({
                target,
                context: grantOnlyContext,
            })),
        );
        const getAccessibleSpaceUuids = vi.fn().mockResolvedValue([]);
        const grantedService = new SearchService({
            analytics: { track: vi.fn() } as never,
            searchModel: {
                search: vi.fn().mockResolvedValue(searchResults),
            } as never,
            projectModel: {
                getSummary: vi.fn().mockResolvedValue({
                    organizationUuid,
                    name: 'Project',
                }),
            } as never,
            spaceModel: {} as never,
            userAttributesModel: {} as never,
            spacePermissionService: {
                resolveAccessBatch,
                getAccessibleSpaceUuids,
            } as never,
            appGenerateService: undefined,
        });

        const filtered = await grantedService.getSearchResults(
            directViewer,
            projectUuid,
            'granted',
        );
        expect(resolveAccessBatch).toHaveBeenCalledWith('direct-user-uuid', [
            {
                type: 'dashboard',
                dashboardUuid: 'dashboard-uuid',
                spaceUuid: 'private-space-uuid',
            },
            {
                type: 'chart',
                chartUuid: 'chart-uuid',
                dashboardUuid: 'dashboard-uuid',
                spaceUuid: 'private-space-uuid',
            },
        ]);
        expect(filtered.dashboards).toHaveLength(1);
        expect(filtered.savedCharts).toHaveLength(1);
        expect(filtered.sqlCharts).toHaveLength(0);
    });
});
