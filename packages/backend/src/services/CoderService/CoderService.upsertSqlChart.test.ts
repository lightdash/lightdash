import { Ability, type RawRuleOf } from '@casl/ability';
import {
    AnyType,
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    SessionUser,
    SpaceMemberRole,
    SqlChartAsCode,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AppModel } from '../../models/AppModel';
import { ContentAsCodeSnapshotModel } from '../../models/ContentAsCodeSnapshotModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { DashboardService } from '../DashboardService/DashboardService';
import { PromoteService } from '../PromoteService/PromoteService';
import { SavedChartService } from '../SavedChartsService/SavedChartService';
import { SchedulerService } from '../SchedulerService/SchedulerService';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';
const CONNECTION_UUID = 'connection-uuid';
const CONNECTION_NAME = 'finance';
const SPACE_UUID = 'space-uuid';
const OTHER_SPACE_UUID = 'other-space-uuid';
const PARENT_SPACE_UUID = 'parent-space-uuid';

const makeUser = (
    rules: RawRuleOf<Ability<PossibleAbilities>>[],
): SessionUser =>
    ({
        userUuid: 'user-uuid',
        email: 'user@test.com',
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: ORG_UUID,
        role: OrganizationMemberRole.MEMBER,
        ability: new Ability<PossibleAbilities>(rules),
        abilityRules: [],
    }) as unknown as SessionUser;

const sqlChartAsCode = {
    name: 'My SQL chart',
    description: 'desc',
    slug: 'my-sql-chart',
    sql: 'SELECT 1',
    limit: 500,
    config: {},
    version: 1,
    spaceSlug: 'my-space',
} as unknown as SqlChartAsCode;

const accessContext = (projectUuid: string = PROJECT_UUID) => ({
    organizationUuid: ORG_UUID,
    projectUuid,
    inheritsFromOrgOrProject: true,
    access: [],
    admins: [],
});

const buildService = (
    savedSqlModel: AnyType,
    resolveAccessBatch: AnyType = vi.fn(
        async (
            _userUuid: string,
            targets: { type: 'space'; spaceUuid: string }[],
        ) =>
            targets.map((target) => ({
                target,
                context: { ...accessContext(), directOnly: false },
            })),
    ),
) =>
    new CoderService({
        directAccessService: {} as AnyType,
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {
            get: vi.fn(async () => ({
                projectUuid: PROJECT_UUID,
                organizationUuid: ORG_UUID,
            })),
            resolveConnectionByName: vi.fn(async () => ({
                connectionUuid: CONNECTION_UUID,
                name: CONNECTION_NAME,
            })),
        } as unknown as ProjectModel,
        savedChartModel: {} as unknown as SavedChartModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        appModel: {} as unknown as AppModel,
        dashboardModel: {} as unknown as DashboardModel,
        spaceModel: {
            find: vi.fn(async () => [{ uuid: SPACE_UUID }]),
            findClosestAncestorByPath: vi.fn(async () => null),
            createSpace: vi.fn(),
        } as unknown as SpaceModel,
        schedulerModel: {} as unknown as SchedulerModel,
        schedulerService: {} as unknown as SchedulerService,
        savedChartService: {} as unknown as SavedChartService,
        dashboardService: {} as unknown as DashboardService,
        schedulerClient: {} as unknown as SchedulerClient,
        promoteService: {} as unknown as PromoteService,
        spacePermissionService: {
            resolveAccessBatch,
            can: vi.fn(async () => true),
        } as unknown as SpacePermissionService,
        contentAsCodeSnapshotModel: {
            upsert: vi.fn(),
        } as unknown as ContentAsCodeSnapshotModel,
        contentAsCodeProjectSettingsModel: { upsert: vi.fn() } as never,
        contentVerificationModel: {} as unknown as ContentVerificationModel,
        groupsModel: {} as never,
        organizationMemberProfileModel: {} as never,
        userModel: {} as never,
    });

const stubSpace = (service: CoderService, uuid: string = SPACE_UUID) =>
    vi.spyOn(service, 'getOrCreateSpace').mockResolvedValue({
        space: { uuid } as AnyType,
        created: false,
    });

const existingRow = (spaceUuid: string = SPACE_UUID) => ({
    saved_sql_uuid: 'existing-uuid',
    space_uuid: spaceUuid,
    slug: sqlChartAsCode.slug,
});

const upsert = (service: CoderService, user: SessionUser) =>
    service.upsertSqlChart(
        user,
        PROJECT_UUID,
        sqlChartAsCode.slug,
        sqlChartAsCode,
    );

describe('CoderService.upsertSqlChart - permissions', () => {
    afterEach(() => vi.clearAllMocks());

    describe('create (chart does not exist yet)', () => {
        it('throws ForbiddenError with ContentAsCode but not CustomSql', async () => {
            const savedSqlModel = {
                find: vi.fn(async () => []),
                create: vi.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'create' },
            ]);

            await expect(upsert(service, user)).rejects.toThrow(ForbiddenError);
            expect(savedSqlModel.create).not.toHaveBeenCalled();
        });

        it('throws ForbiddenError with CustomSql but no space create:SavedChart', async () => {
            const savedSqlModel = {
                find: vi.fn(async () => []),
                create: vi.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'create' },
                { subject: 'CustomSql', action: 'manage' },
            ]);

            await expect(upsert(service, user)).rejects.toThrow(
                'You don\'t have access to create Saved SQL chart "my-sql-chart"',
            );
            expect(savedSqlModel.create).not.toHaveBeenCalled();
        });

        it('creates the chart with ContentAsCode + CustomSql + create:SavedChart', async () => {
            const savedSqlModel = {
                find: vi.fn(async () => []),
                create: vi.fn(async () => ({ savedSqlUuid: 'new-uuid' })),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'create' },
                { subject: 'CustomSql', action: 'manage' },
                {
                    subject: 'SavedChart',
                    action: 'create',
                    conditions: { projectUuid: PROJECT_UUID },
                },
            ]);

            await expect(upsert(service, user)).resolves.not.toThrow();
        });

        it('rejects creation below a restricted parent without creating an orphan space', async () => {
            const savedSqlModel = {
                find: vi.fn(async () => []),
                create: vi.fn(),
            };
            const service = buildService(savedSqlModel);
            vi.mocked(service.spaceModel.find).mockResolvedValue([]);
            vi.mocked(
                service.spaceModel.findClosestAncestorByPath,
            ).mockResolvedValue(PARENT_SPACE_UUID);
            vi.mocked(
                service.spacePermissionService.resolveAccessBatch,
            ).mockResolvedValue([
                {
                    target: { type: 'space', spaceUuid: PARENT_SPACE_UUID },
                    context: {
                        organizationUuid: ORG_UUID,
                        projectUuid: PROJECT_UUID,
                        inheritsFromOrgOrProject: false,
                        access: [],
                        admins: [],
                        directOnly: false,
                    },
                },
            ]);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'create' },
                { subject: 'CustomSql', action: 'manage' },
                {
                    subject: 'Space',
                    action: 'create',
                    conditions: { projectUuid: PROJECT_UUID },
                },
                {
                    subject: 'SavedChart',
                    action: 'create',
                    conditions: {
                        access: {
                            $elemMatch: {
                                userUuid: 'user-uuid',
                                role: SpaceMemberRole.EDITOR,
                            },
                        },
                    },
                },
            ]);

            await expect(
                service.upsertSqlChart(
                    user,
                    PROJECT_UUID,
                    sqlChartAsCode.slug,
                    {
                        ...sqlChartAsCode,
                        spaceSlug: 'restricted/new-space',
                    },
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(service.spaceModel.createSpace).not.toHaveBeenCalled();
            expect(savedSqlModel.create).not.toHaveBeenCalled();
        });
    });

    describe('update (chart already exists)', () => {
        it('updates the chart with CustomSql + update:SavedChart in its space', async () => {
            const savedSqlModel = {
                find: vi.fn(async () => [existingRow(SPACE_UUID)]),
                update: vi.fn(async () => ({
                    savedSqlUuid: 'existing-uuid',
                })),
                create: vi.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service, SPACE_UUID);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'create' },
                { subject: 'CustomSql', action: 'manage' },
                {
                    subject: 'SavedChart',
                    action: 'update',
                    conditions: { projectUuid: PROJECT_UUID },
                },
            ]);

            await expect(upsert(service, user)).resolves.not.toThrow();
        });

        it('throws ForbiddenError on update without update:SavedChart', async () => {
            const savedSqlModel = {
                find: vi.fn(async () => [existingRow(SPACE_UUID)]),
                update: vi.fn(),
                create: vi.fn(),
            };
            const service = buildService(savedSqlModel);
            stubSpace(service, SPACE_UUID);
            const user = makeUser([
                { subject: 'ContentAsCode', action: 'create' },
                { subject: 'CustomSql', action: 'manage' },
            ]);

            await expect(upsert(service, user)).rejects.toThrow(ForbiddenError);
            expect(savedSqlModel.update).not.toHaveBeenCalled();
        });

        it.each(['create', 'manage'] as const)(
            'blocks a move before space creation when current access is denied (%s)',
            async (uploadAction) => {
                // Chart currently lives in OTHER_SPACE_UUID; YAML moves it to SPACE_UUID.
                // User can update in the target space but not the current one.
                const savedSqlModel = {
                    find: vi.fn(async () => [existingRow(OTHER_SPACE_UUID)]),
                    update: vi.fn(),
                    create: vi.fn(),
                };
                const resolveAccessBatch = vi.fn(
                    async (
                        _userUuid: string,
                        targets: { type: 'space'; spaceUuid: string }[],
                    ) =>
                        targets.map((target) => ({
                            target,
                            context:
                                target.spaceUuid === SPACE_UUID
                                    ? {
                                          ...accessContext(PROJECT_UUID),
                                          directOnly: false,
                                      }
                                    : {
                                          ...accessContext(
                                              'inaccessible-project',
                                          ),
                                          directOnly: false,
                                      },
                        })),
                );
                const service = buildService(savedSqlModel, resolveAccessBatch);
                stubSpace(service, SPACE_UUID);
                const user = makeUser([
                    { subject: 'ContentAsCode', action: uploadAction },
                    { subject: 'CustomSql', action: 'manage' },
                    {
                        subject: 'SavedChart',
                        action: 'update',
                        conditions: { projectUuid: PROJECT_UUID },
                    },
                ]);

                await expect(upsert(service, user)).rejects.toThrow(
                    'You don\'t have access to update Saved SQL chart "my-sql-chart"',
                );
                expect(savedSqlModel.update).not.toHaveBeenCalled();
                expect(service.getOrCreateSpace).not.toHaveBeenCalled();
                // Reject the current space before resolving or creating the target.
                expect(resolveAccessBatch).toHaveBeenCalledWith('user-uuid', [
                    { type: 'space', spaceUuid: OTHER_SPACE_UUID },
                ]);
            },
        );
    });
});

describe('CoderService.upsertSqlChart - connection', () => {
    afterEach(() => vi.clearAllMocks());

    const editor = () =>
        makeUser([
            { subject: 'ContentAsCode', action: 'create' },
            { subject: 'CustomSql', action: 'manage' },
            {
                subject: 'SavedChart',
                action: 'create',
                conditions: { projectUuid: PROJECT_UUID },
            },
            {
                subject: 'SavedChart',
                action: 'update',
                conditions: { projectUuid: PROJECT_UUID },
            },
        ]);

    it('creates the chart on the connection the definition names', async () => {
        const savedSqlModel = {
            find: vi.fn(async () => []),
            create: vi.fn(async () => ({ savedSqlUuid: 'new-uuid' })),
        };
        const service = buildService(savedSqlModel);
        stubSpace(service);

        await service.upsertSqlChart(
            editor(),
            PROJECT_UUID,
            sqlChartAsCode.slug,
            { ...sqlChartAsCode, connectionName: CONNECTION_NAME },
        );

        expect(
            service.projectModel.resolveConnectionByName,
        ).toHaveBeenCalledWith(PROJECT_UUID, CONNECTION_NAME);
        expect(savedSqlModel.create).toHaveBeenCalledWith(
            'user-uuid',
            PROJECT_UUID,
            expect.objectContaining({ connectionUuid: CONNECTION_UUID }),
        );
    });

    it('resolves a create without a name against the project', async () => {
        const savedSqlModel = {
            find: vi.fn(async () => []),
            create: vi.fn(async () => ({ savedSqlUuid: 'new-uuid' })),
        };
        const service = buildService(savedSqlModel);
        stubSpace(service);

        await service.upsertSqlChart(
            editor(),
            PROJECT_UUID,
            sqlChartAsCode.slug,
            sqlChartAsCode,
        );

        expect(
            service.projectModel.resolveConnectionByName,
        ).toHaveBeenCalledWith(PROJECT_UUID, undefined);
        expect(savedSqlModel.create).toHaveBeenCalledWith(
            'user-uuid',
            PROJECT_UUID,
            expect.objectContaining({ connectionUuid: CONNECTION_UUID }),
        );
    });

    it('keeps the stored connection when an update names none', async () => {
        const savedSqlModel = {
            find: vi.fn(async () => [existingRow()]),
            update: vi.fn(async () => ({ savedSqlUuid: 'existing-uuid' })),
            create: vi.fn(),
        };
        const service = buildService(savedSqlModel);
        stubSpace(service);

        await service.upsertSqlChart(
            editor(),
            PROJECT_UUID,
            sqlChartAsCode.slug,
            sqlChartAsCode,
        );

        expect(
            service.projectModel.resolveConnectionByName,
        ).not.toHaveBeenCalled();
        expect(savedSqlModel.update).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlChart: expect.objectContaining({
                    versionedData: expect.objectContaining({
                        connectionUuid: undefined,
                    }),
                }),
            }),
        );
    });

    it('moves the chart when an update names another connection', async () => {
        const savedSqlModel = {
            find: vi.fn(async () => [existingRow()]),
            update: vi.fn(async () => ({ savedSqlUuid: 'existing-uuid' })),
            create: vi.fn(),
        };
        const service = buildService(savedSqlModel);
        stubSpace(service);

        await service.upsertSqlChart(
            editor(),
            PROJECT_UUID,
            sqlChartAsCode.slug,
            { ...sqlChartAsCode, connectionName: CONNECTION_NAME },
        );

        expect(savedSqlModel.update).toHaveBeenCalledWith(
            expect.objectContaining({
                sqlChart: expect.objectContaining({
                    versionedData: expect.objectContaining({
                        connectionUuid: CONNECTION_UUID,
                    }),
                }),
            }),
        );
    });
});
