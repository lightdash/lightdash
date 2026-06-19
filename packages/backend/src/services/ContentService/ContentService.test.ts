import {
    ChartSourceType,
    ContentType,
    defineUserAbility,
    KnexPaginatedData,
    OrganizationMemberRole,
    ProjectMemberRole,
    SummaryContent,
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

const createService = ({
    contentModel = {} as ContentModel,
    spaceModel = {} as SpaceModel,
    spacePermissionService = {} as SpacePermissionService,
}: {
    contentModel?: ContentModel;
    spaceModel?: SpaceModel;
    spacePermissionService?: SpacePermissionService;
} = {}) => {
    const projectModel = {
        getAllByOrganizationUuid: jest.fn().mockResolvedValue([
            {
                projectUuid,
                name: 'Test project',
                organizationUuid,
            },
        ]),
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
            contentModel,
            spaceModel,
            spaceService: spaceService as unknown as SpaceService,
            dashboardService: dashboardService as unknown as DashboardService,
            savedChartService:
                savedChartService as unknown as SavedChartService,
            savedSqlService: savedSqlService as unknown as SavedSqlService,
            spacePermissionService,
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

describe('ContentService.find', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('filters content to spaces the service account user can view', async () => {
        const accessibleSpaceUuid = 'accessible-space-uuid';
        const privateSpaceUuid = 'private-space-uuid';
        const findSummaryContents = jest.fn(
            async (): Promise<KnexPaginatedData<SummaryContent[]>> => ({
                pagination: {
                    page: 1,
                    pageSize: 50,
                    totalPageCount: 1,
                    totalResults: 0,
                },
                data: [],
            }),
        );
        const getAccessibleSpaceUuids = jest
            .fn()
            .mockResolvedValue([accessibleSpaceUuid]);
        const user = {
            ...createUser(),
            serviceAccount: {
                uuid: 'service-account-uuid',
                description: 'Embedded customer actions',
            },
        };
        const deps = createService({
            contentModel: {
                findSummaryContents,
            } as unknown as ContentModel,
            spaceModel: {
                find: jest
                    .fn()
                    .mockResolvedValue([
                        { uuid: accessibleSpaceUuid },
                        { uuid: privateSpaceUuid },
                    ]),
            } as unknown as SpaceModel,
            spacePermissionService: {
                getAccessibleSpaceUuids,
                getDirectAccessUserUuids: jest.fn(),
            } as unknown as SpacePermissionService,
        });

        await deps.service.find(
            user,
            {
                projectUuids: [projectUuid],
                contentTypes: [ContentType.SPACE],
            },
            {},
            { page: 1, pageSize: 50 },
        );

        expect(getAccessibleSpaceUuids).toHaveBeenCalledWith('view', user, [
            accessibleSpaceUuid,
            privateSpaceUuid,
        ]);
        expect(findSummaryContents).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuids: [projectUuid],
                spaceUuids: [accessibleSpaceUuid],
                contentTypes: [ContentType.SPACE],
            }),
            expect.any(Object),
            expect.objectContaining({ page: 1, pageSize: 50 }),
        );
    });
});
