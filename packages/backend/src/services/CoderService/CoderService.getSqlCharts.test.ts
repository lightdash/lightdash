import { Ability } from '@casl/ability';
import {
    AnyType,
    OrganizationMemberRole,
    PossibleAbilities,
    SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SpaceModel } from '../../models/SpaceModel';
import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';
const SPACE_UUID = 'space-uuid';
const CONNECTION_UUID = 'connection-uuid';
const CONNECTION_NAME = 'finance';

const admin = {
    userUuid: 'user-uuid',
    email: 'admin@test.com',
    firstName: 'Test',
    lastName: 'Admin',
    organizationUuid: ORG_UUID,
    role: OrganizationMemberRole.ADMIN,
    abilityRules: [],
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
} as unknown as SessionUser;

const sqlChartRow = (connectionUuid: string | null) => ({
    saved_sql_uuid: 'saved-sql-uuid',
    name: 'Invoices',
    description: 'desc',
    slug: 'invoices',
    sql: 'SELECT 1',
    limit: 500,
    config: {},
    chart_kind: 'table',
    last_version_updated_at: new Date('2026-09-18T00:00:00.000Z'),
    space_uuid: SPACE_UUID,
    path: 'my_space',
    connection_uuid: connectionUuid,
});

const buildService = (connectionUuid: string | null) =>
    new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            get: vi.fn(async () => ({
                projectUuid: PROJECT_UUID,
                organizationUuid: ORG_UUID,
            })),
            getConnectionNamesByUuid: vi.fn(
                async () => new Map([[CONNECTION_UUID, CONNECTION_NAME]]),
            ),
        } as unknown as ProjectModel,
        savedSqlModel: {
            find: vi.fn(async () => [sqlChartRow(connectionUuid)]),
        } as unknown as SavedSqlModel,
        spaceModel: {
            find: vi.fn(async () => [
                { uuid: SPACE_UUID, name: 'My space', path: 'my_space' },
            ]),
        } as unknown as SpaceModel,
        directAccessService: {
            listPoliciesForExport: vi.fn(async () => ({})),
        } as AnyType,
        savedChartModel: {} as AnyType,
        appModel: {} as AnyType,
        dashboardModel: {} as AnyType,
        schedulerModel: {} as AnyType,
        schedulerService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        schedulerClient: {} as AnyType,
        promoteService: {} as AnyType,
        spacePermissionService: {} as AnyType,
        contentAsCodeSnapshotModel: {} as AnyType,
        contentAsCodeProjectSettingsModel: {} as AnyType,
        contentVerificationModel: {} as AnyType,
        groupsModel: {} as AnyType,
        organizationMemberProfileModel: {} as AnyType,
        userModel: {} as AnyType,
    });

describe('CoderService.getSqlCharts - connection', () => {
    afterEach(() => vi.clearAllMocks());

    it('emits the portable connection name', async () => {
        const service = buildService(CONNECTION_UUID);

        const { sqlCharts } = await service.getSqlCharts(admin, PROJECT_UUID);

        expect(sqlCharts).toHaveLength(1);
        expect(sqlCharts[0].connectionName).toBe(CONNECTION_NAME);
    });

    it('omits the key for a chart with no connection', async () => {
        const service = buildService(null);

        const { sqlCharts } = await service.getSqlCharts(admin, PROJECT_UUID);

        expect(sqlCharts[0]).not.toHaveProperty('connectionName');
    });
});
