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
            resolveAccessBatch: vi.fn().mockResolvedValue({}),
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
