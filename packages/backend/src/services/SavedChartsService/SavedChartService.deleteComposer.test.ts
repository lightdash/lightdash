import { Ability } from '@casl/ability';
import {
    type PossibleAbilities,
    type SavedChartVariant,
    type SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { SavedChartService } from './SavedChartService';

const composerVariant = {
    queryType: 'composer',
    chart: {
        uuid: 'composer-chart-uuid',
        name: 'Revenue per payment method',
        slug: 'revenue-per-payment-method',
        projectUuid: 'project-uuid',
        organizationUuid: 'org-uuid',
        spaceUuid: 'space-uuid',
        dashboardUuid: 'dashboard-uuid',
        pipeline: { schemaVersion: 1, nodes: [], terminalNodeId: 'final' },
    },
} as unknown as SavedChartVariant;

const user = {
    userUuid: 'user-uuid',
    organizationUuid: 'org-uuid',
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'SavedChart',
            action: ['delete'],
            conditions: { organizationUuid: 'org-uuid' },
        },
    ]),
} as unknown as SessionUser;

const savedChartModel = {
    getVariant: vi.fn(async () => composerVariant),
    get: vi.fn(async () => {
        throw new Error('get must not be called for a composer chart');
    }),
    softDelete: vi.fn(async () => composerVariant),
};
const projectModel = { getExploreFromCache: vi.fn(async () => null) };
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

describe('SavedChartService.delete on a composer chart', () => {
    const service = new SavedChartService({
        analytics: analyticsMock,
        lightdashConfig: {
            ...lightdashConfigMock,
            softDelete: { ...lightdashConfigMock.softDelete, enabled: true },
        },
        projectModel,
        savedChartModel,
        spacePermissionService,
        dashboardModel: {},
        catalogModel: {},
        spaceModel: {},
        analyticsModel: {},
        pinnedListModel: {},
        schedulerModel: {},
        schedulerService: {
            softDeleteByChartUuid: vi.fn(async () => undefined),
        },
        schedulerClient: {},
        slackClient: {},
        permissionsService: {},
        contentVerificationModel: {
            getByContent: vi.fn(async () => undefined),
        },
        organizationModel: {},
        contentAsCodeProjectSettingsModel: {
            get: vi.fn(async () => undefined),
        },
        contentAsCodeSnapshotModel: {},
        contentDraftModel: {},
    } as never);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('soft-deletes without reading the chart as a classic chart', async () => {
        await service.delete(user, 'composer-chart-uuid');

        expect(savedChartModel.get).not.toHaveBeenCalled();
        expect(savedChartModel.softDelete).toHaveBeenCalledWith(
            'composer-chart-uuid',
            'user-uuid',
        );
        expect(projectModel.getExploreFromCache).not.toHaveBeenCalled();
    });
});
