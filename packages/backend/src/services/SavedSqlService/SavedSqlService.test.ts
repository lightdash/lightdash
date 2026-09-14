import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    PossibleAbilities,
    SchedulerFormat,
} from '@lightdash/common';
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

const sqlChart = {
    savedSqlUuid,
    name: 'Chart',
    organization: { organizationUuid },
    project: { projectUuid },
    space: { uuid: spaceUuid, name: 'Space' },
};

const baseUser = {
    userId: 1,
    userUuid: 'user-uuid',
    email: 'user@test.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    isSetupComplete: true,
    isActive: true,
    timezone: null,
    isPending: false,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const adminUser = {
    ...baseUser,
    userUuid: 'admin-uuid',
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'SavedChart',
            action: 'view',
        },
        {
            subject: 'ScheduledDeliveries',
            action: 'manage',
            conditions: { organizationUuid },
        },
    ]),
};

const editorUser = {
    ...baseUser,
    userUuid: 'editor-uuid',
    role: OrganizationMemberRole.EDITOR,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'SavedChart',
            action: 'view',
        },
        {
            subject: 'ScheduledDeliveries',
            action: 'create',
            conditions: { organizationUuid },
        },
        {
            subject: 'ScheduledDeliveries',
            action: 'manage',
            conditions: { organizationUuid, userUuid: 'editor-uuid' },
        },
    ]),
};

const viewerUser = {
    ...baseUser,
    userUuid: 'viewer-uuid',
    role: OrganizationMemberRole.VIEWER,
    ability: new Ability<PossibleAbilities>([]),
};

const createdScheduler = {
    schedulerUuid: 'scheduler-uuid',
    name: 'Test',
    cron: '0 9 * * *',
    timezone: 'UTC',
    format: SchedulerFormat.IMAGE,
    savedChartUuid: null,
    dashboardUuid: null,
    savedSqlUuid,
    createdBy: 'editor-uuid',
    targets: [],
    includeLinks: false,
    plainTextEmail: false,
    enabled: true,
    options: {},
};

const savedSqlModel = {
    getByUuid: vi.fn(async () => sqlChart),
    resolveColorPalette: vi.fn(async () => undefined),
    update: vi.fn(async () => ({
        savedSqlUuid,
        savedSqlVersionUuid: null,
    })),
    softDelete: vi.fn(async () => undefined),
    moveToSpace: vi.fn(async () => undefined),
};
const schedulerModel = {
    getSqlChartSchedulers: vi.fn(async () => []),
    createScheduler: vi.fn(async () => createdScheduler),
};
const schedulerClient = {
    runSql: vi.fn(async () => 'job-uuid'),
    runSqlPivotQuery: vi.fn(async () => 'job-uuid'),
};
const projectModel = {
    getSummary: vi.fn(async () => ({ organizationUuid })),
};
const spacePermissionService = {
    can: vi.fn(async () => true),
    resolveAccessBatch: vi.fn(
        async (_userUuid: string, targets: { spaceUuid: string }[]) =>
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
    ),
};

const newSchedulerPayload = {
    name: 'Test',
    cron: '0 9 * * *',
    timezone: 'UTC',
    format: SchedulerFormat.IMAGE,
    options: {},
    targets: [],
    includeLinks: false,
    plainTextEmail: false,
    enabled: true,
    appUuid: null,
    appName: null,
};

describe('SavedSqlService - Scheduler authorization (PROD-7098)', () => {
    const service = new SavedSqlService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: projectModel as unknown as ProjectModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        analyticsModel: {} as unknown as AnalyticsModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });

    afterEach(() => vi.clearAllMocks());

    test('loads a saved SQL chart through its resource access target', async () => {
        const user = {
            ...baseUser,
            ability: new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'view' },
            ]),
        };

        await expect(
            service.getSqlChart(user, projectUuid, savedSqlUuid),
        ).resolves.toBeDefined();
        expect(spacePermissionService.resolveAccessBatch).toHaveBeenCalledWith(
            user.userUuid,
            [
                {
                    type: 'sqlChart',
                    savedSqlUuid,
                    spaceUuid,
                },
            ],
        );
    });

    test('keeps embed write actors scoped to their write space', async () => {
        const embedWriteUser = {
            ...baseUser,
            ability: new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'view' },
            ]),
        };

        await expect(
            service.getSqlChartFromAccount(
                {
                    authentication: {
                        type: 'jwt',
                        data: {
                            content: {
                                type: 'dashboard',
                                dashboardUuid: 'dashboard-uuid',
                            },
                            writeActions: { spaceUuid },
                        },
                    },
                    embedWriteUser,
                    isJwtUser: () => true,
                } as never,
                projectUuid,
                savedSqlUuid,
            ),
        ).resolves.toBeDefined();
        expect(spacePermissionService.resolveAccessBatch).toHaveBeenCalledWith(
            embedWriteUser.userUuid,
            [{ type: 'space', spaceUuid }],
        );
    });

    describe('direct-grant write boundaries', () => {
        const editor = {
            ...baseUser,
            ability: new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: ['update', 'delete'] },
                { subject: 'CustomSql', action: 'manage' },
            ]),
        };

        test('updates a saved SQL chart through its resource access target', async () => {
            await service.updateSqlChart(
                editor,
                projectUuid,
                savedSqlUuid,
                {} as never,
            );

            expect(
                spacePermissionService.resolveAccessBatch,
            ).toHaveBeenCalledWith(editor.userUuid, [
                {
                    type: 'sqlChart',
                    savedSqlUuid,
                    spaceUuid,
                },
            ]);
        });

        test('soft-deletes a saved SQL chart through its resource access target', async () => {
            await service.softDelete(editor, savedSqlUuid);

            expect(
                spacePermissionService.resolveAccessBatch,
            ).toHaveBeenCalledWith(editor.userUuid, [
                {
                    type: 'sqlChart',
                    savedSqlUuid,
                    spaceUuid,
                },
            ]);
        });

        test('requires real access to both spaces when moving a saved SQL chart', async () => {
            const targetSpaceUuid = 'target-space-uuid';
            const accessContext = {
                organizationUuid,
                projectUuid,
                inheritsFromOrgOrProject: false,
                access: [],
                admins: [],
                directOnly: false,
            };
            spacePermissionService.resolveAccessBatch.mockResolvedValueOnce([
                {
                    target: { spaceUuid },
                    context: accessContext,
                },
                {
                    target: { spaceUuid: targetSpaceUuid },
                    context: accessContext,
                },
            ]);

            await service.moveToSpace(editor, {
                projectUuid,
                itemUuid: savedSqlUuid,
                targetSpaceUuid,
            });

            expect(
                spacePermissionService.resolveAccessBatch,
            ).toHaveBeenCalledWith(editor.userUuid, [
                { type: 'space', spaceUuid },
                { type: 'space', spaceUuid: targetSpaceUuid },
            ]);
        });
    });

    describe('deprecated Graphile execution boundaries', () => {
        test('requires space access to execute a saved SQL pivot query', async () => {
            spacePermissionService.can.mockResolvedValueOnce(false);

            await expect(
                service.getResultJobFromSqlPivotQuery(editorUser, projectUuid, {
                    savedSqlUuid,
                } as never),
            ).rejects.toThrow(ForbiddenError);
            expect(schedulerClient.runSqlPivotQuery).not.toHaveBeenCalled();
            expect(
                spacePermissionService.resolveAccessBatch,
            ).not.toHaveBeenCalled();
        });

        test('requires space access to execute a saved SQL chart query', async () => {
            spacePermissionService.can.mockResolvedValueOnce(false);

            await expect(
                service.getSqlChartResultJob(
                    editorUser,
                    projectUuid,
                    undefined,
                    savedSqlUuid,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(schedulerClient.runSql).not.toHaveBeenCalled();
            expect(
                spacePermissionService.resolveAccessBatch,
            ).not.toHaveBeenCalled();
        });
    });

    describe('getSchedulers', () => {
        it('admin lists all SQL chart schedulers', async () => {
            await expect(
                service.getSchedulers(adminUser, projectUuid, savedSqlUuid),
            ).resolves.toEqual([]);
            expect(schedulerModel.getSqlChartSchedulers).toHaveBeenCalledWith(
                savedSqlUuid,
                undefined,
            );
        });

        it('editor lists only their own SQL chart schedulers', async () => {
            await expect(
                service.getSchedulers(editorUser, projectUuid, savedSqlUuid),
            ).resolves.toEqual([]);
            expect(schedulerModel.getSqlChartSchedulers).toHaveBeenCalledWith(
                savedSqlUuid,
                'editor-uuid',
            );
        });

        it('viewer is blocked from listing SQL chart schedulers', async () => {
            await expect(
                service.getSchedulers(viewerUser, projectUuid, savedSqlUuid),
            ).rejects.toThrow(ForbiddenError);
            expect(schedulerModel.getSqlChartSchedulers).not.toHaveBeenCalled();
        });

        it('user without chart access is blocked', async () => {
            spacePermissionService.resolveAccessBatch.mockResolvedValueOnce([
                {
                    target: { spaceUuid },
                    context: undefined,
                },
            ] as never);
            await expect(
                service.getSchedulers(editorUser, projectUuid, savedSqlUuid),
            ).rejects.toThrow(
                "You don't have access to view this Saved SQL chart",
            );
            expect(schedulerModel.getSqlChartSchedulers).not.toHaveBeenCalled();
        });
    });

    describe('createScheduler', () => {
        it('admin can create scheduler on SQL chart', async () => {
            await expect(
                service.createScheduler(
                    adminUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).resolves.toBeDefined();
        });

        it('editor can create scheduler on SQL chart (PROD-7098 fix)', async () => {
            await expect(
                service.createScheduler(
                    editorUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).resolves.toBeDefined();
        });

        it('viewer is blocked from creating scheduler', async () => {
            await expect(
                service.createScheduler(
                    viewerUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(schedulerModel.createScheduler).not.toHaveBeenCalled();
        });

        it('user without chart access is blocked from creating scheduler', async () => {
            spacePermissionService.resolveAccessBatch.mockResolvedValueOnce([
                {
                    target: { spaceUuid },
                    context: undefined,
                },
            ] as never);
            await expect(
                service.createScheduler(
                    editorUser,
                    projectUuid,
                    savedSqlUuid,
                    newSchedulerPayload,
                ),
            ).rejects.toThrow(
                "You don't have access to view this Saved SQL chart",
            );
            expect(schedulerModel.createScheduler).not.toHaveBeenCalled();
        });
    });
});

describe('SavedSqlService - hasAccess space-move gate', () => {
    const managerUser = {
        ...baseUser,
        userUuid: 'manager-uuid',
        role: OrganizationMemberRole.EDITOR,
        ability: new Ability<PossibleAbilities>([
            { subject: 'SavedChart', action: 'manage' },
        ]),
    };

    const service = new SavedSqlService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: {} as unknown as ProjectModel,
        savedSqlModel: savedSqlModel as unknown as SavedSqlModel,
        schedulerClient: {} as unknown as SchedulerClient,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        analyticsModel: {} as unknown as AnalyticsModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });
    // The gate itself is the unit under test: it correlates the current and
    // target space contexts from one resolveAccessBatch call.
    const hasAccess = (resource: {
        savedSqlUuid: string;
        spaceUuid?: string;
    }) =>
        (
            service as unknown as {
                hasAccess: (
                    action: string,
                    actor: { user: typeof managerUser; projectUuid: string },
                    resource: { savedSqlUuid: string; spaceUuid?: string },
                ) => Promise<unknown>;
            }
        ).hasAccess('manage', { user: managerUser, projectUuid }, resource);

    afterEach(() => vi.clearAllMocks());

    it('authorizes a move using target-keyed contexts even when batch results arrive reversed', async () => {
        (
            spacePermissionService.resolveAccessBatch as import('vitest').Mock
        ).mockImplementationOnce(
            async (_userUuid: string, targets: { spaceUuid: string }[]) =>
                targets
                    .map((target) => ({
                        target,
                        context: {
                            organizationUuid,
                            projectUuid,
                            inheritsFromOrgOrProject: true,
                            access: [],
                            admins: [],
                            directOnly: false,
                        },
                    }))
                    .reverse(),
        );

        await expect(
            hasAccess({ savedSqlUuid, spaceUuid: 'new-space-uuid' }),
        ).resolves.toBeDefined();
        expect(spacePermissionService.resolveAccessBatch).toHaveBeenCalledWith(
            managerUser.userUuid,
            [
                { type: 'space', spaceUuid },
                { type: 'space', spaceUuid: 'new-space-uuid' },
            ],
        );
    });

    it('denies when the current space context is unresolvable', async () => {
        (
            spacePermissionService.resolveAccessBatch as import('vitest').Mock
        ).mockImplementationOnce(
            async (_userUuid: string, targets: { spaceUuid: string }[]) =>
                targets.map((target) => ({
                    target,
                    context:
                        target.spaceUuid === spaceUuid
                            ? undefined
                            : {
                                  organizationUuid,
                                  projectUuid,
                                  inheritsFromOrgOrProject: true,
                                  access: [],
                                  admins: [],
                                  directOnly: false,
                              },
                })),
        );

        await expect(
            hasAccess({ savedSqlUuid, spaceUuid: 'new-space-uuid' }),
        ).rejects.toThrowError(ForbiddenError);
    });

    it('denies with the new-space error when the target space context is unresolvable', async () => {
        (
            spacePermissionService.resolveAccessBatch as import('vitest').Mock
        ).mockImplementationOnce(
            async (_userUuid: string, targets: { spaceUuid: string }[]) =>
                targets.map((target) => ({
                    target,
                    context:
                        target.spaceUuid === 'new-space-uuid'
                            ? undefined
                            : {
                                  organizationUuid,
                                  projectUuid,
                                  inheritsFromOrgOrProject: true,
                                  access: [],
                                  admins: [],
                                  directOnly: false,
                              },
                })),
        );

        await expect(
            hasAccess({ savedSqlUuid, spaceUuid: 'new-space-uuid' }),
        ).rejects.toThrowError(/new space/);
    });
});
