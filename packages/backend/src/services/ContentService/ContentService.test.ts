import {
    ChartSourceType,
    ContentType,
    defineUserAbility,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';
import type { DeletedContentItem, SessionUser } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import type { ContentModel } from '../../models/ContentModel/ContentModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import type { SpaceModel } from '../../models/SpaceModel';
import type { DashboardService } from '../DashboardService/DashboardService';
import type { SavedChartService } from '../SavedChartsService/SavedChartService';
import type { SavedSqlService } from '../SavedSqlService/SavedSqlService';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import type { SpaceService } from '../SpaceService/SpaceService';
import { ContentService } from './ContentService';

const projectUuid = 'project-uuid';
const organizationUuid = 'organization-uuid';
const userUuid = 'user-uuid';

const createUser = (): SessionUser =>
    ({
        userId: 1,
        userUuid,
        organizationUuid,
        ability: defineUserAbility(
            {
                userUuid,
                role: OrganizationMemberRole.MEMBER,
                organizationUuid,
            },
            [
                {
                    projectUuid,
                    role: ProjectMemberRole.ADMIN,
                    userUuid,
                    roleUuid: undefined,
                },
            ],
        ),
    }) as SessionUser;

const createService = () => {
    const projectModel = {
        getSummary: jest.fn().mockResolvedValue({
            organizationUuid,
            name: 'Test project',
        }),
    };
    const savedChartService = {
        restore: jest.fn().mockResolvedValue(undefined),
        permanentDelete: jest.fn().mockResolvedValue(undefined),
    };
    const savedSqlService = {
        restore: jest.fn().mockResolvedValue(undefined),
        permanentDelete: jest.fn().mockResolvedValue(undefined),
    };
    const dashboardService = {
        restore: jest.fn().mockResolvedValue(undefined),
        permanentDelete: jest.fn().mockResolvedValue(undefined),
    };
    const spaceService = {
        restore: jest.fn().mockResolvedValue(undefined),
        permanentDelete: jest.fn().mockResolvedValue(undefined),
    };

    return {
        service: new ContentService({
            analytics: analyticsMock,
            projectModel: projectModel as unknown as ProjectModel,
            contentModel: {} as ContentModel,
            spaceModel: {} as SpaceModel,
            spaceService: spaceService as unknown as SpaceService,
            dashboardService: dashboardService as unknown as DashboardService,
            savedChartService:
                savedChartService as unknown as SavedChartService,
            savedSqlService: savedSqlService as unknown as SavedSqlService,
            spacePermissionService: {} as SpacePermissionService,
            appMoveService: undefined,
            appGenerateService: undefined,
        }),
        projectModel,
        savedChartService,
        savedSqlService,
        dashboardService,
        spaceService,
    };
};

describe('ContentService deleted content actions', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('restoreContent', () => {
        it.each<
            [
                string,
                DeletedContentItem,
                keyof Pick<
                    ReturnType<typeof createService>,
                    | 'savedChartService'
                    | 'savedSqlService'
                    | 'dashboardService'
                    | 'spaceService'
                >,
            ]
        >([
            [
                'DBT chart',
                {
                    uuid: 'chart-uuid',
                    contentType: ContentType.CHART,
                    source: ChartSourceType.DBT_EXPLORE,
                },
                'savedChartService',
            ],
            [
                'SQL chart',
                {
                    uuid: 'sql-chart-uuid',
                    contentType: ContentType.CHART,
                    source: ChartSourceType.SQL,
                },
                'savedSqlService',
            ],
            [
                'dashboard',
                { uuid: 'dashboard-uuid', contentType: ContentType.DASHBOARD },
                'dashboardService',
            ],
            [
                'space',
                { uuid: 'space-uuid', contentType: ContentType.SPACE },
                'spaceService',
            ],
        ])(
            'passes authorized projectUuid for %s restore',
            async (_, item, key) => {
                const deps = createService();
                const user = createUser();

                await deps.service.restoreContent(user, projectUuid, item);

                expect(deps[key].restore).toHaveBeenCalledWith(
                    user,
                    item.uuid,
                    { projectUuid },
                );
            },
        );
    });

    describe('permanentlyDeleteContent', () => {
        it.each<
            [
                string,
                DeletedContentItem,
                keyof Pick<
                    ReturnType<typeof createService>,
                    | 'savedChartService'
                    | 'savedSqlService'
                    | 'dashboardService'
                    | 'spaceService'
                >,
            ]
        >([
            [
                'DBT chart',
                {
                    uuid: 'chart-uuid',
                    contentType: ContentType.CHART,
                    source: ChartSourceType.DBT_EXPLORE,
                },
                'savedChartService',
            ],
            [
                'SQL chart',
                {
                    uuid: 'sql-chart-uuid',
                    contentType: ContentType.CHART,
                    source: ChartSourceType.SQL,
                },
                'savedSqlService',
            ],
            [
                'dashboard',
                { uuid: 'dashboard-uuid', contentType: ContentType.DASHBOARD },
                'dashboardService',
            ],
            [
                'space',
                { uuid: 'space-uuid', contentType: ContentType.SPACE },
                'spaceService',
            ],
        ])(
            'passes authorized projectUuid for %s permanent delete',
            async (_, item, key) => {
                const deps = createService();
                const user = createUser();

                await deps.service.permanentlyDeleteContent(
                    user,
                    projectUuid,
                    item,
                );

                expect(deps[key].permanentDelete).toHaveBeenCalledWith(
                    user,
                    item.uuid,
                    { projectUuid },
                );
            },
        );
    });
});
