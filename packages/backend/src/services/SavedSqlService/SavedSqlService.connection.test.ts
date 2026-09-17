import { Ability } from '@casl/ability';
import {
    ChartKind,
    MultipleConnectionsError,
    OrganizationMemberRole,
    ProjectType,
    WarehouseTypes,
    type Connection,
    type CreateSqlChart,
    type PossibleAbilities,
    type SessionUser,
    type SqlChart,
    type SqlRunnerPivotQueryBody,
    type UpdateSqlChart,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { SavedSqlService } from './SavedSqlService';

const organizationUuid = 'org-uuid';
const projectUuid = 'project-uuid';
const savedSqlUuid = 'saved-sql-uuid';
const spaceUuid = 'space-uuid';
const storedConnectionUuid = 'stored-connection-uuid';

const chartConfig = { type: ChartKind.TABLE } as SqlChart['config'];

const user: SessionUser = {
    userId: 1,
    userUuid: 'user-uuid',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    role: OrganizationMemberRole.EDITOR,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    isSetupComplete: true,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    timezone: null,
    avatarUrl: null,
    avatarGradient: null,
    abilityRules: [],
    ability: new Ability<PossibleAbilities>([
        { subject: 'CustomSql', action: 'manage' },
        { subject: 'SavedChart', action: ['create', 'update'] },
    ]),
};

const savedChart = {
    savedSqlUuid,
    connectionUuid: storedConnectionUuid,
    name: 'Saved SQL chart',
    sql: 'select 1',
    limit: 500,
    config: chartConfig,
    organization: { organizationUuid },
    project: { projectUuid },
    space: { uuid: spaceUuid, name: 'Space' },
} as SqlChart;

const connection = (connectionUuid: string): Connection => ({
    connectionUuid,
    name: connectionUuid,
    warehouseType: WarehouseTypes.POSTGRES,
    organizationWarehouseCredentialsUuid: null,
    listAllDatabases: false,
    additionalDatabases: [],
    createdAt: new Date(),
});

const projectModel = {
    getSummary: vi.fn<ProjectModel['getSummary']>(),
    resolveConnection: vi.fn<ProjectModel['resolveConnection']>(),
};
const savedSqlModel = {
    create: vi.fn<SavedSqlModel['create']>(),
    getByUuid: vi.fn<SavedSqlModel['getByUuid']>(),
    update: vi.fn<SavedSqlModel['update']>(),
};
const schedulerClient = {
    runSql: vi.fn<SchedulerClient['runSql']>(),
    runSqlPivotQuery: vi.fn<SchedulerClient['runSqlPivotQuery']>(),
};
const analyticsModel = {
    addSqlChartViewEvent: vi.fn<AnalyticsModel['addSqlChartViewEvent']>(),
};
const spacePermissionService = {
    can: vi.fn<SpacePermissionService['can']>(),
    resolveAccessBatch: vi.fn<SpacePermissionService['resolveAccessBatch']>(),
};

const createPayload: CreateSqlChart = {
    name: 'New SQL chart',
    description: null,
    sql: 'select 1',
    limit: 500,
    config: chartConfig,
    spaceUuid,
};

const versionedUpdate = (connectionUuid?: string | null): UpdateSqlChart => ({
    versionedData: {
        sql: 'select 2',
        limit: 500,
        config: chartConfig,
        connectionUuid,
    },
});

const service = new SavedSqlService({
    lightdashConfig: lightdashConfigMock,
    analytics: analyticsMock,
    projectModel: projectModel as unknown as ProjectModel,
    savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
    schedulerClient: schedulerClient as unknown as SchedulerClient,
    schedulerModel: {} as SchedulerModel,
    analyticsModel: analyticsModel as unknown as AnalyticsModel,
    spacePermissionService:
        spacePermissionService as unknown as SpacePermissionService,
});

describe('SavedSqlService connection bindings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        projectModel.getSummary.mockResolvedValue({
            organizationUuid,
            projectUuid,
            slug: 'project',
            name: 'Project',
            type: ProjectType.DEFAULT,
            upstreamProjectUuid: undefined,
            createdByUserUuid: user.userUuid,
            provisioningSource: null,
        });
        projectModel.resolveConnection.mockImplementation(
            async (_projectUuid, connectionUuid) =>
                connection(`resolved-${connectionUuid ?? 'sole'}`),
        );
        savedSqlModel.create.mockResolvedValue({
            savedSqlUuid,
            slug: 'saved-sql-chart',
            savedSqlVersionUuid: 'saved-sql-version-uuid',
        });
        savedSqlModel.getByUuid.mockResolvedValue(savedChart);
        savedSqlModel.update.mockResolvedValue({
            savedSqlUuid,
            savedSqlVersionUuid: 'saved-sql-version-uuid',
        });
        schedulerClient.runSql.mockResolvedValue('sql-job-uuid');
        schedulerClient.runSqlPivotQuery.mockResolvedValue('pivot-job-uuid');
        analyticsModel.addSqlChartViewEvent.mockResolvedValue(undefined);
        spacePermissionService.can.mockResolvedValue(true);
        spacePermissionService.resolveAccessBatch.mockImplementation(
            async (_userUuid, targets) =>
                targets.map((target) => ({
                    target,
                    context: {
                        organizationUuid,
                        projectUuid,
                        inheritsFromOrgOrProject: false,
                        access: [],
                        admins: [],
                        directOnly: true,
                    },
                })),
        );
    });

    it('persists the resolved active connection when creating a SQL chart', async () => {
        await service.createSqlChart(user, projectUuid, {
            ...createPayload,
            connectionUuid: 'requested-connection-uuid',
        });

        expect(projectModel.resolveConnection).toHaveBeenCalledWith(
            projectUuid,
            'requested-connection-uuid',
        );
        expect(savedSqlModel.create).toHaveBeenCalledWith(
            user.userUuid,
            projectUuid,
            expect.objectContaining({
                connectionUuid: 'resolved-requested-connection-uuid',
            }),
        );
    });

    it('preserves the saved version binding when an update omits a selector', async () => {
        await service.updateSqlChart(
            user,
            projectUuid,
            savedSqlUuid,
            versionedUpdate(),
        );

        expect(projectModel.resolveConnection).toHaveBeenCalledWith(
            projectUuid,
            storedConnectionUuid,
        );
        expect(savedSqlModel.update).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlChart: expect.objectContaining({
                    versionedData: expect.objectContaining({
                        connectionUuid: `resolved-${storedConnectionUuid}`,
                    }),
                }),
            }),
        );
    });

    it('validates and persists an explicit update selector', async () => {
        await service.updateSqlChart(
            user,
            projectUuid,
            savedSqlUuid,
            versionedUpdate('requested-connection-uuid'),
        );

        expect(projectModel.resolveConnection).toHaveBeenCalledWith(
            projectUuid,
            'requested-connection-uuid',
        );
        expect(savedSqlModel.update).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlChart: expect.objectContaining({
                    versionedData: expect.objectContaining({
                        connectionUuid: 'resolved-requested-connection-uuid',
                    }),
                }),
            }),
        );
    });

    it('uses the stored binding for saved chart and pivot jobs', async () => {
        const pivotBody: SqlRunnerPivotQueryBody = {
            savedSqlUuid,
            connectionUuid: 'active-runner-connection-uuid',
            sql: 'select request_sql_that_must_be_ignored',
            indexColumn: undefined,
            valuesColumns: [],
            groupByColumns: undefined,
            sortBy: undefined,
        };

        await service.getSqlChartResultJob(
            user,
            projectUuid,
            undefined,
            savedSqlUuid,
        );
        await service.getResultJobFromSqlPivotQuery(
            user,
            projectUuid,
            pivotBody,
        );

        expect(projectModel.resolveConnection).toHaveBeenNthCalledWith(
            1,
            projectUuid,
            storedConnectionUuid,
        );
        expect(projectModel.resolveConnection).toHaveBeenNthCalledWith(
            2,
            projectUuid,
            storedConnectionUuid,
        );
        expect(schedulerClient.runSql).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionUuid: `resolved-${storedConnectionUuid}`,
            }),
        );
        expect(schedulerClient.runSqlPivotQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                connectionUuid: `resolved-${storedConnectionUuid}`,
                savedSqlUuid,
                sql: savedChart.sql,
            }),
        );
    });

    it('rejects an unselected connection when the project has several', async () => {
        projectModel.resolveConnection.mockRejectedValueOnce(
            new MultipleConnectionsError(),
        );

        await expect(
            service.createSqlChart(user, projectUuid, {
                ...createPayload,
                connectionUuid: null,
            }),
        ).rejects.toThrow(MultipleConnectionsError);

        expect(savedSqlModel.create).not.toHaveBeenCalled();
    });
});
