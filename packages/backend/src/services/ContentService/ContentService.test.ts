import {
    ChartSourceType,
    ContentType,
    defineUserAbility,
    ForbiddenError,
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
import type { ValidationModel } from '../../models/ValidationModel/ValidationModel';
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

const createOrganizationAdminUser = (): SessionUser => ({
    ...createUser(),
    role: OrganizationMemberRole.ADMIN,
    ability: defineUserAbility(
        {
            userUuid,
            role: OrganizationMemberRole.ADMIN,
            organizationUuid,
        },
        [],
    ),
});

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
        getAllByOrganizationUuid: vi.fn().mockResolvedValue([
            {
                projectUuid,
                name: 'Test project',
                organizationUuid,
            },
        ]),
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid,
            name: 'Test project',
        }),
    };
    const savedChartService = {
        restore: vi.fn().mockResolvedValue(undefined),
        permanentDelete: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const savedSqlService = {
        restore: vi.fn().mockResolvedValue(undefined),
        permanentDelete: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const dashboardService = {
        restore: vi.fn().mockResolvedValue(undefined),
        permanentDelete: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const spaceService = {
        restore: vi.fn().mockResolvedValue(undefined),
        permanentDelete: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
    };
    const validationModel = {
        deleteChartValidations: vi.fn().mockResolvedValue(undefined),
        deleteDashboardValidations: vi.fn().mockResolvedValue(undefined),
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
            validationModel: validationModel as unknown as ValidationModel,
            appMoveService: undefined,
            appGenerateService: undefined,
        }),
        projectModel,
        savedChartService,
        savedSqlService,
        dashboardService,
        spaceService,
        validationModel,
    };
};

describe('ContentService deleted content actions', () => {
    afterEach(() => {
        vi.clearAllMocks();
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
        vi.clearAllMocks();
    });

    it('filters content to spaces the service account user can view', async () => {
        const accessibleSpaceUuid = 'accessible-space-uuid';
        const privateSpaceUuid = 'private-space-uuid';
        const findSummaryContents = vi.fn(
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
        const getAccessibleSpaceUuids = vi
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
                find: vi
                    .fn()
                    .mockResolvedValue([
                        { uuid: accessibleSpaceUuid },
                        { uuid: privateSpaceUuid },
                    ]),
            } as unknown as SpaceModel,
            spacePermissionService: {
                getAccessibleSpaceUuids,
                getDirectAccessUserUuids: vi.fn(),
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

    // The vizs-only listing skips space scoping, so it must be gated on
    // manage:Explore like the viz library endpoint.
    describe('dataAppVizsFilter=only authorization', () => {
        const emptyPage = (): Promise<KnexPaginatedData<SummaryContent[]>> =>
            Promise.resolve({
                pagination: {
                    page: 1,
                    pageSize: 50,
                    totalPageCount: 1,
                    totalResults: 0,
                },
                data: [],
            });

        const findWithUser = async (user: SessionUser) => {
            const findSummaryContents = vi.fn(emptyPage);
            const deps = createService({
                contentModel: {
                    findSummaryContents,
                } as unknown as ContentModel,
                spaceModel: {
                    find: vi.fn().mockResolvedValue([]),
                } as unknown as SpaceModel,
                spacePermissionService: {
                    getAccessibleSpaceUuids: vi.fn().mockResolvedValue([]),
                    getDirectAccessUserUuids: vi.fn(),
                } as unknown as SpacePermissionService,
            });
            await deps.service.find(
                user,
                {
                    projectUuids: [projectUuid],
                    contentTypes: [ContentType.DATA_APP],
                    dataAppVizsFilter: 'only',
                },
                {},
                { page: 1, pageSize: 50 },
            );
            return findSummaryContents;
        };

        it('drops projects where the user cannot manage explores', async () => {
            const viewer: SessionUser = {
                ...createUser(),
                ability: defineUserAbility(
                    {
                        userUuid,
                        role: OrganizationMemberRole.MEMBER,
                        organizationUuid,
                    },
                    [
                        {
                            projectUuid,
                            role: ProjectMemberRole.VIEWER,
                            userUuid,
                            roleUuid: undefined,
                        },
                    ],
                ),
            };

            const findSummaryContents = await findWithUser(viewer);

            expect(findSummaryContents).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuids: [],
                    dataAppVizsFilter: 'only',
                }),
                expect.any(Object),
                expect.any(Object),
            );
        });

        it('keeps projects where the user can manage explores', async () => {
            const findSummaryContents = await findWithUser(createUser());

            expect(findSummaryContents).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuids: [projectUuid],
                    dataAppVizsFilter: 'only',
                }),
                expect.any(Object),
                expect.any(Object),
            );
        });
    });
});

describe('ContentService.bulkDelete', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('dispatches deletes per content type and clears validation rows', async () => {
        const deps = createService();
        const user = createUser();

        const results = await deps.service.bulkDelete(user, projectUuid, [
            {
                uuid: 'chart-uuid',
                contentType: ContentType.CHART,
                source: ChartSourceType.DBT_EXPLORE,
            },
            {
                uuid: 'sql-chart-uuid',
                contentType: ContentType.CHART,
                source: ChartSourceType.SQL,
            },
            { uuid: 'dashboard-uuid', contentType: ContentType.DASHBOARD },
            { uuid: 'space-uuid', contentType: ContentType.SPACE },
        ]);

        expect(results).toEqual({ deletedCount: 4, skipped: [] });
        expect(deps.savedChartService.delete).toHaveBeenCalledWith(
            user,
            'chart-uuid',
            { projectUuid },
        );
        expect(
            deps.validationModel.deleteChartValidations,
        ).toHaveBeenCalledWith('chart-uuid', projectUuid);
        expect(deps.savedSqlService.delete).toHaveBeenCalledWith(
            user,
            'sql-chart-uuid',
        );
        expect(deps.dashboardService.delete).toHaveBeenCalledWith(
            user,
            'dashboard-uuid',
            { projectUuid },
        );
        expect(
            deps.validationModel.deleteDashboardValidations,
        ).toHaveBeenCalledWith('dashboard-uuid', projectUuid);
        expect(deps.spaceService.delete).toHaveBeenCalledWith(
            user,
            'space-uuid',
        );
    });

    it('reports partial success when some items cannot be deleted', async () => {
        const deps = createService();
        deps.savedChartService.delete.mockRejectedValueOnce(
            new ForbiddenError(),
        );
        const user = createUser();

        const results = await deps.service.bulkDelete(user, projectUuid, [
            {
                uuid: 'forbidden-chart-uuid',
                contentType: ContentType.CHART,
                source: ChartSourceType.DBT_EXPLORE,
            },
            { uuid: 'dashboard-uuid', contentType: ContentType.DASHBOARD },
            { uuid: 'app-uuid', contentType: ContentType.DATA_APP },
        ]);

        expect(results.deletedCount).toBe(1);
        expect(results.skipped).toHaveLength(2);
        expect(results.skipped[0]).toMatchObject({
            uuid: 'forbidden-chart-uuid',
            contentType: ContentType.CHART,
        });
        expect(results.skipped[1]).toMatchObject({
            uuid: 'app-uuid',
            contentType: ContentType.DATA_APP,
        });
        // Failed chart delete must not clear its validation rows
        expect(
            deps.validationModel.deleteChartValidations,
        ).not.toHaveBeenCalled();
    });

    it('rejects a project the user cannot view', async () => {
        const deps = createService();
        deps.projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'another-organization-uuid',
            name: 'Another project',
        });

        await expect(
            deps.service.bulkDelete(
                createOrganizationAdminUser(),
                projectUuid,
                [
                    {
                        uuid: 'dashboard-uuid',
                        contentType: ContentType.DASHBOARD,
                    },
                ],
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(deps.dashboardService.delete).not.toHaveBeenCalled();
    });
});

describe('ContentService.findDeleted', () => {
    it('rejects a project owned by another organization', async () => {
        const findDeletedContents = vi.fn();
        const deps = createService({
            contentModel: {
                findDeletedContents,
            } as unknown as ContentModel,
        });
        deps.projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'another-organization-uuid',
            name: 'Another project',
        });

        await expect(
            deps.service.findDeleted(createOrganizationAdminUser(), {
                projectUuids: [projectUuid],
            }),
        ).rejects.toThrow(ForbiddenError);
        expect(findDeletedContents).not.toHaveBeenCalled();
    });
});
