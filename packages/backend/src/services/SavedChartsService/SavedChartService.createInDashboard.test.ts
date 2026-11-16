import { Ability } from '@casl/ability';
import {
    MergeJoinType,
    type Account,
    type CreateSavedChart,
    type DashboardDAO,
    type PossibleAbilities,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SavedChartService } from './SavedChartService';

const DASHBOARD_UUID = 'dashboard-uuid';
const DASHBOARD_SLUG = 'sales-dashboard';
const WRITE_SPACE_UUID = 'write-space-uuid';

const writeActor = {
    userUuid: 'write-actor-uuid',
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'SavedChart',
            action: ['create'],
            conditions: { organizationUuid: 'org-uuid' },
        },
    ]),
};

const embedAccount = {
    isJwtUser: () => true,
    embedWriteUser: writeActor,
    authentication: {
        type: 'jwt',
        data: {
            content: { type: 'dashboard', dashboardUuid: DASHBOARD_UUID },
            writeActions: {
                userUuid: writeActor.userUuid,
                writeSpaceUuids: [WRITE_SPACE_UUID],
            },
        },
    },
} as unknown as Account;

const dashboard = {
    uuid: DASHBOARD_UUID,
    slug: DASHBOARD_SLUG,
    spaceUuid: WRITE_SPACE_UUID,
} as unknown as DashboardDAO;

const createdChart = {
    uuid: 'chart-uuid',
    name: 'Revenue',
    description: undefined,
    projectUuid: 'project-uuid',
    organizationUuid: 'org-uuid',
    spaceUuid: WRITE_SPACE_UUID,
    dashboardUuid: DASHBOARD_UUID,
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        metrics: [],
        dimensions: [],
        filters: { dimensions: {}, metrics: {}, tableCalculations: {} },
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: 'table', config: {} },
    tableConfig: { columnOrder: [] },
};

const chartSavedBySlug = {
    name: createdChart.name,
    tableName: createdChart.tableName,
    metricQuery: createdChart.metricQuery,
    chartConfig: createdChart.chartConfig,
    tableConfig: createdChart.tableConfig,
    dashboardUuid: DASHBOARD_SLUG,
} as unknown as CreateSavedChart;

const savedChartModel = { create: vi.fn(async () => createdChart) };
const dashboardModel = { getByIdOrSlug: vi.fn(async () => dashboard) };
const projectModel = {
    getExploreFromCache: vi.fn(async () => null),
    getSummary: vi.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
    })),
};
const spacePermissionService = {
    resolveAccess: vi.fn(async () => ({
        organizationUuid: 'org-uuid',
        projectUuid: 'project-uuid',
        inheritsFromOrgOrProject: true,
        access: [],
        admins: [],
        directOnly: false,
    })),
};
const catalogModel = {
    findTablesCachedExploreUuid: vi.fn(async () => ({})),
    updateFieldsChartUsage: vi.fn(async () => undefined),
};

const buildService = (lightdashConfig = lightdashConfigMock) =>
    new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig,
        projectModel,
        savedChartModel,
        dashboardModel,
        catalogModel,
        spacePermissionService,
        spaceModel: {},
        analyticsModel: {},
        pinnedListModel: {},
        schedulerModel: {},
        schedulerService: {},
        schedulerClient: {},
        slackClient: {},
        permissionsService: {},
        contentVerificationModel: {
            getByContent: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
        },
        organizationModel: {},
        contentAsCodeProjectSettingsModel: {
            get: vi.fn(async () => undefined),
        },
        contentAsCodeSnapshotModel: {},
        contentDraftModel: {},
    } as never);

describe('SavedChartService.create into a dashboard', () => {
    const service = buildService();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('stores the resolved dashboard uuid when the request carries a slug', async () => {
        await service.create(embedAccount, 'project-uuid', chartSavedBySlug);

        expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
            DASHBOARD_SLUG,
            { projectUuid: 'project-uuid' },
        );
        expect(savedChartModel.create).toHaveBeenCalledWith(
            'project-uuid',
            writeActor.userUuid,
            expect.objectContaining({ dashboardUuid: DASHBOARD_UUID }),
        );
    });

    test('refuses a merged chart from an actor without the merge scope', async () => {
        await expect(
            service.create(embedAccount, 'project-uuid', {
                ...chartSavedBySlug,
                merge: {
                    queries: {},
                    join: MergeJoinType.FULL,
                    keys: {},
                    limit: 500,
                },
            }),
        ).rejects.toThrow('User cannot save merged charts');
        expect(savedChartModel.create).not.toHaveBeenCalled();
    });

    test('refuses a merged chart from an actor with the merge scope when merge authoring is disabled', async () => {
        const mergeActor = {
            ...writeActor,
            ability: new Ability<PossibleAbilities>([
                ...writeActor.ability.rules,
                {
                    subject: 'MergeQuery',
                    action: ['manage'],
                    conditions: { organizationUuid: 'org-uuid' },
                },
            ]),
        };
        const mergeAccount = {
            ...embedAccount,
            embedWriteUser: mergeActor,
        } as unknown as Account;
        const mergedChart = {
            ...chartSavedBySlug,
            merge: {
                queries: {},
                join: MergeJoinType.FULL,
                keys: {},
                limit: 500,
            },
        };

        await service.create(mergeAccount, 'project-uuid', mergedChart);
        expect(savedChartModel.create).toHaveBeenCalledTimes(1);

        const disabledService = buildService({
            ...lightdashConfigMock,
            mergeQueryAuthoring: { enabled: false },
        });
        await expect(
            disabledService.create(mergeAccount, 'project-uuid', mergedChart),
        ).rejects.toThrow('User cannot save merged charts');
        expect(savedChartModel.create).toHaveBeenCalledTimes(1);
    });
});
