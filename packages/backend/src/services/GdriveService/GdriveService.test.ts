import { Ability } from '@casl/ability';
import {
    CustomDimensionType,
    DimensionType,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    SessionUser,
    TableCalculationType,
    type CustomSqlDimension,
    type SqlTableCalculation,
    type UploadMetricGsheet,
} from '@lightdash/common';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { UserModel } from '../../models/UserModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { ProjectService } from '../ProjectService/ProjectService';
import { GdriveService } from './GdriveService';

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';

const sqlCustomDim: CustomSqlDimension = {
    id: 'dim-1',
    name: 'Bucketed amount',
    type: CustomDimensionType.SQL,
    table: 'orders',
    sql: 'CASE WHEN x > 0 THEN 1 ELSE 0 END',
    dimensionType: DimensionType.NUMBER,
};

const sqlTableCalc: SqlTableCalculation = {
    name: 'doubled',
    displayName: 'doubled',
    sql: '${orders.amount} * 2',
    type: TableCalculationType.NUMBER,
};

const baseGsheetOptions: UploadMetricGsheet = {
    projectUuid,
    exploreId: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: [],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        customDimensions: [],
    },
    showTableNames: false,
    columnOrder: [],
};

const baseSessionUser: SessionUser = {
    userUuid: 'editor-uuid',
    email: 'editor@test.com',
    firstName: 'Editor',
    lastName: 'User',
    organizationUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    userId: 1,
    role: OrganizationMemberRole.EDITOR,
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ability: new Ability<PossibleAbilities>([
        { subject: 'ExportCsv', action: 'manage' },
        { subject: 'GoogleSheets', action: 'manage' },
    ]),
};

const editorWithoutCustomFields = fromSession(baseSessionUser);

const sessionUserWithoutGsheets: SessionUser = {
    ...baseSessionUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'ExportCsv', action: 'manage' },
    ]),
};

const accountWithoutGsheets = fromSession(sessionUserWithoutGsheets);

const makeService = () => {
    const projectModel = {
        getSummary: jest.fn(async () => ({
            organizationUuid,
            projectUuid,
            name: 'Test Project',
        })),
    };

    const projectService = {
        getProject: jest.fn(async () => ({ organizationUuid })),
    };

    const schedulerClient = {
        uploadGsheetFromQueryJob: jest.fn(async () => ({
            jobId: 'job-uuid',
        })),
    };

    const service = new GdriveService({
        lightdashConfig: lightdashConfigMock,
        projectService: projectService as unknown as ProjectService,
        savedChartModel: {} as unknown as SavedChartModel,
        dashboardModel: {} as unknown as DashboardModel,
        userModel: {} as unknown as UserModel,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        projectModel: projectModel as unknown as ProjectModel,
    });

    return { service, projectModel, projectService, schedulerClient };
};

describe('GdriveService.scheduleUploadGsheet', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('schedules export when chart contains an inherited SQL custom dimension and editor lacks manage:CustomFields', async () => {
        const { service, schedulerClient } = makeService();

        await expect(
            service.scheduleUploadGsheet(editorWithoutCustomFields, {
                ...baseGsheetOptions,
                metricQuery: {
                    ...baseGsheetOptions.metricQuery,
                    customDimensions: [sqlCustomDim],
                },
            }),
        ).resolves.toEqual({ jobId: 'job-uuid' });

        expect(schedulerClient.uploadGsheetFromQueryJob).toHaveBeenCalled();
    });

    it('schedules export when chart contains an inherited SQL table calculation and editor lacks manage:CustomFields', async () => {
        const { service, schedulerClient } = makeService();

        await expect(
            service.scheduleUploadGsheet(editorWithoutCustomFields, {
                ...baseGsheetOptions,
                metricQuery: {
                    ...baseGsheetOptions.metricQuery,
                    tableCalculations: [sqlTableCalc],
                },
            }),
        ).resolves.toEqual({ jobId: 'job-uuid' });

        expect(schedulerClient.uploadGsheetFromQueryJob).toHaveBeenCalled();
    });

    it('throws ForbiddenError when user lacks manage:GoogleSheets', async () => {
        const { service, schedulerClient } = makeService();

        await expect(
            service.scheduleUploadGsheet(
                accountWithoutGsheets,
                baseGsheetOptions,
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(schedulerClient.uploadGsheetFromQueryJob).not.toHaveBeenCalled();
    });
});
