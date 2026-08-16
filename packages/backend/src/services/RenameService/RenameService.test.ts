import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    RenameType,
    RequestMethod,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { chartMocked } from './rename.mock';
import { RenameService } from './RenameService';

const chart = {
    ...chartMocked,
    tableName: 'orders',
    metricQuery: {
        ...chartMocked.metricQuery,
        exploreName: 'orders',
        dimensions: [],
        metrics: ['orders_amount'],
        sorts: [],
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
    },
    tableConfig: {
        ...chartMocked.tableConfig,
        columnOrder: ['orders_amount'],
    },
};

const savedChartModel = {
    get: vi.fn(async () => chart),
    createVersion: vi.fn<SavedChartModel['createVersion']>(async () => chart),
};
const projectModel = {
    getExploreFromCache: vi.fn(async () => ({})),
};
const spacePermissionService = {
    getSpaceAccessContext: vi.fn(async () => ({
        inheritsFromOrgOrProject: true,
        access: [],
    })),
};

const user: SessionUser = {
    userUuid: 'user-uuid',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: chart.organizationUuid,
    organizationName: 'Test organization',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: 'update' },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const service = new RenameService({
    lightdashConfig: lightdashConfigMock,
    analytics: analyticsMock,
    projectModel: projectModel as unknown as ProjectModel,
    savedChartModel: savedChartModel as unknown as SavedChartModel,
    dashboardModel: {} as unknown as DashboardModel,
    schedulerClient: {} as unknown as SchedulerClient,
    schedulerModel: {} as unknown as SchedulerModel,
    spacePermissionService:
        spacePermissionService as unknown as SpacePermissionService,
});

describe('RenameService', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    test('persists a chart repointed to a qualified explore', async () => {
        await service.renameChart({
            user,
            projectUuid: chart.projectUuid,
            chartUuid: chart.uuid,
            from: 'orders',
            to: 'sourceA__orders',
            type: RenameType.MODEL,
            context: RequestMethod.WEB_APP,
        });

        expect(savedChartModel.createVersion).toHaveBeenCalledOnce();
        const persistedChart = vi.mocked(savedChartModel.createVersion).mock
            .calls[0]![1];
        expect(persistedChart.tableName).toBe('sourceA__orders');
        expect(persistedChart.metricQuery.exploreName).toBe('sourceA__orders');
        expect(persistedChart.metricQuery.metrics).toEqual([
            'sourceA__orders_amount',
        ]);
        expect(persistedChart.tableConfig.columnOrder).toEqual([
            'sourceA__orders_amount',
        ]);
    });
});
