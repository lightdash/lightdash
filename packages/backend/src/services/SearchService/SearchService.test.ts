import { type SessionUser } from '@lightdash/common';
import { SearchService } from './SearchService';

const user = { userUuid: 'user-uuid' } as SessionUser;
const projectUuid = 'project-uuid';

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
                organizationUuid: 'organization-uuid',
                name: 'Project',
            }),
        } as never,
        spaceModel: {} as never,
        userAttributesModel: {} as never,
        spacePermissionService: {
            getSpacesAccessContext: vi.fn().mockResolvedValue({}),
        } as never,
        appGenerateService: appGenerateService as never,
    });
    (
        service as unknown as {
            createAuditedAbility: () => {
                cannot: () => boolean;
                canBulk: () => boolean[];
            };
        }
    ).createAuditedAbility = () => ({
        cannot: () => false,
        canBulk: () => [],
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
            'organization-uuid',
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
