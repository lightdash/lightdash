import { Ability, RawRuleOf } from '@casl/ability';
import {
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    PossibleAbilities,
    SchedulerAndTargets,
    SchedulerFormat,
    SessionUser,
    UnexpectedGoogleSheetsError,
    type ChartScheduler,
    type CreateSchedulerAndTargets,
    type UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { GoogleDriveClient } from '../../clients/Google/GoogleDriveClient';
import { SlackClient } from '../../clients/Slack/SlackClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { AppModel } from '../../models/AppModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { JobModel } from '../../models/JobModel/JobModel';
import type { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SavedSqlModel } from '../../models/SavedSqlModel';
import { SchedulerModel } from '../../models/SchedulerModel';
import { UserModel } from '../../models/UserModel';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { UserService } from '../UserService';
import { SchedulerService } from './SchedulerService';

const projectUuid = 'projectUuid';
const organizationUuid = 'organizationUuid';
const privateSpaceUuid = 'private-space-uuid';
const savedChartUuid = 'savedChartUuid';

// An interactive_viewer can `create` ScheduledDeliveries unconditionally within
// a project, but can only `view` charts in spaces they inherit or have access to.
const interactiveViewer: SessionUser = {
    userUuid: 'userUuid',
    email: 'email',
    firstName: 'firstName',
    lastName: 'lastName',
    organizationUuid,
    organizationName: 'organizationName',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    timezone: null,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.MEMBER,
    ability: new Ability<PossibleAbilities>([
        {
            subject: 'ScheduledDeliveries',
            action: ['create'],
            conditions: { projectUuid },
        },
        {
            subject: 'SavedChart',
            action: ['view'],
            conditions: { projectUuid, inheritsFromOrgOrProject: true },
        },
    ]),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const chartSchedulerInPrivateSpace: ChartScheduler = {
    schedulerUuid: 'schedulerUuid',
    slug: 'scheduler',
    name: 'scheduler',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'otherUserUuid',
    createdByName: 'other user',
    format: SchedulerFormat.CSV,
    cron: '0 0 * * *',
    savedChartUuid,
    savedChartName: 'chart',
    dashboardUuid: null,
    dashboardName: null,
    savedSqlUuid: null,
    savedSqlName: null,
    appUuid: null,
    appName: null,
    options: { formatted: true, limit: 'table' },
    enabled: true,
    includeLinks: true,
    plainTextEmail: false,
};

const dashboardScheduler = {
    schedulerUuid: 'schedulerUuid',
    name: 'scheduler name',
    dashboardUuid: 'dashboardUuid',
    savedChartUuid: null,
    savedSqlUuid: null,
    appUuid: null,
    targets: [],
} as unknown as SchedulerAndTargets;

const dashboardSummary = {
    organizationUuid,
    projectUuid,
    spaceUuid: 'spaceUuid',
};

const schedulerModel = {
    getScheduler: vi.fn(async () => chartSchedulerInPrivateSpace),
    getSchedulerAndTargets: vi.fn(async () => dashboardScheduler),
};

const savedChartModel = {
    getSummary: vi.fn(async () => ({
        organizationUuid,
        projectUuid,
        spaceUuid: privateSpaceUuid,
    })),
};

const dashboardModel = {
    getByIdOrSlug: vi.fn(async () => dashboardSummary),
};

const spacePermissionService = {
    getSpaceAccessContext: vi.fn(async () => ({
        inheritsFromOrgOrProject: false,
        access: [],
    })),
};

const schedulerClient = {
    addScheduledDeliveryJob: vi.fn(async () => ({})),
};

const slackClient = {
    joinChannels: vi.fn(async () => {}),
};

const buildUser = (
    abilities: RawRuleOf<Ability<PossibleAbilities>>[],
): SessionUser =>
    ({
        userUuid: 'userUuid',
        organizationUuid,
        organizationName: 'organizationName',
        organizationCreatedAt: new Date(),
        role: OrganizationMemberRole.VIEWER,
        ability: new Ability<PossibleAbilities>(abilities),
    }) as unknown as SessionUser;

const buildService = () =>
    new SchedulerService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        schedulerModel: schedulerModel as unknown as SchedulerModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
        savedChartModel: savedChartModel as unknown as SavedChartModel,
        savedSqlModel: {} as SavedSqlModel,
        appModel: {} as AppModel,
        projectModel: {} as ProjectModel,
        schedulerClient: schedulerClient as unknown as SchedulerClient,
        slackClient: slackClient as unknown as SlackClient,
        emailClient: {} as EmailClient,
        userModel: {} as UserModel,
        googleDriveClient: {} as GoogleDriveClient,
        userService: {} as UserService,
        jobModel: {} as JobModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
    });

describe('SchedulerService', () => {
    const service = buildService();

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('sendSchedulerByUuid', () => {
        const userWhoCanSendPersistedScheduler = buildUser([
            { subject: 'ScheduledDeliveries', action: ['create'] },
            { subject: 'SavedChart', action: ['view'] },
        ]);

        test('should throw ForbiddenError when user cannot view the underlying resource', async () => {
            await expect(
                service.sendSchedulerByUuid(
                    interactiveViewer,
                    chartSchedulerInPrivateSpace.schedulerUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(
                schedulerClient.addScheduledDeliveryJob,
            ).not.toHaveBeenCalled();
        });

        test('executes send-now deliveries as the authenticated user', async () => {
            await service.sendSchedulerByUuid(
                userWhoCanSendPersistedScheduler,
                chartSchedulerInPrivateSpace.schedulerUuid,
            );

            expect(
                schedulerClient.addScheduledDeliveryJob,
            ).toHaveBeenCalledWith(
                expect.any(Date),
                expect.objectContaining({
                    executionUserUuid:
                        userWhoCanSendPersistedScheduler.userUuid,
                    userUuid: userWhoCanSendPersistedScheduler.userUuid,
                }),
                chartSchedulerInPrivateSpace.schedulerUuid,
            );
        });
    });

    describe('sendScheduler', () => {
        const sendNowPayload = {
            name: 'send now delivery',
            format: SchedulerFormat.CSV,
            cron: '0 0 * * *',
            options: { formatted: true, limit: 'table' },
            savedChartUuid,
            dashboardUuid: null,
            savedSqlUuid: null,
            appUuid: null,
            createdBy: 'userUuid',
            enabled: true,
            includeLinks: true,
            plainTextEmail: false,
            targets: [{ recipient: 'recipient@example.com' }],
        } as unknown as CreateSchedulerAndTargets;

        const userWhoCanSend = buildUser([
            { subject: 'ScheduledDeliveries', action: ['create'] },
            { subject: 'SavedChart', action: ['view'] },
            { subject: 'Dashboard', action: ['view'] },
        ]);

        test('passes sourceSchedulerUuid to the delivery job when it matches the saved scheduler resource', async () => {
            await service.sendScheduler(userWhoCanSend, {
                ...sendNowPayload,
                sourceSchedulerUuid: chartSchedulerInPrivateSpace.schedulerUuid,
            });

            expect(schedulerModel.getScheduler).toHaveBeenCalledWith(
                chartSchedulerInPrivateSpace.schedulerUuid,
            );
            expect(
                schedulerClient.addScheduledDeliveryJob,
            ).toHaveBeenCalledWith(
                expect.any(Date),
                expect.objectContaining({
                    sourceSchedulerUuid:
                        chartSchedulerInPrivateSpace.schedulerUuid,
                }),
                undefined,
            );
        });

        test('throws ParameterError when sourceSchedulerUuid belongs to a different resource', async () => {
            await expect(
                service.sendScheduler(userWhoCanSend, {
                    ...sendNowPayload,
                    savedChartUuid: null,
                    dashboardUuid: 'dashboardUuid',
                    sourceSchedulerUuid:
                        chartSchedulerInPrivateSpace.schedulerUuid,
                }),
            ).rejects.toThrowError(ParameterError);

            expect(
                schedulerClient.addScheduledDeliveryJob,
            ).not.toHaveBeenCalled();
        });

        test('does not look up a saved scheduler when no sourceSchedulerUuid is given', async () => {
            await service.sendScheduler(userWhoCanSend, sendNowPayload);

            expect(schedulerModel.getScheduler).not.toHaveBeenCalled();
            expect(
                schedulerClient.addScheduledDeliveryJob,
            ).toHaveBeenCalledWith(
                expect.any(Date),
                expect.not.objectContaining({
                    sourceSchedulerUuid: expect.anything(),
                }),
                undefined,
            );
        });

        test.each([
            { webhook: 'https://169.254.169.254/latest/meta-data' },
            { googleChatWebhook: 'https://127.0.0.1/hook' },
        ])(
            'rejects an unsafe webhook before enqueueing a send-now job',
            async (target) => {
                await expect(
                    service.sendScheduler(userWhoCanSend, {
                        ...sendNowPayload,
                        targets: [target],
                    }),
                ).rejects.toThrowError(ParameterError);

                expect(
                    schedulerClient.addScheduledDeliveryJob,
                ).not.toHaveBeenCalled();
            },
        );

        describe('app payloads', () => {
            const sendAppUuid = 'appUuid';
            const sendAppRow = {
                app_uuid: sendAppUuid,
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
                space_uuid: null,
                created_by_user_uuid: 'userUuid',
                name: 'Sales App',
            };

            const buildAppSendService = () => {
                const appSendSchedulerClient = {
                    addScheduledDeliveryJob: vi.fn(async () => ({})),
                };
                const appSendSlackClient = {
                    joinChannels: vi.fn(async () => {}),
                };
                const appSendService = new SchedulerService({
                    lightdashConfig: lightdashConfigMock,
                    analytics: analyticsMock,
                    schedulerModel: {} as SchedulerModel,
                    dashboardModel: {} as DashboardModel,
                    savedChartModel: {} as SavedChartModel,
                    savedSqlModel: {} as SavedSqlModel,
                    appModel: {
                        findAppByUuid: vi.fn(async () => sendAppRow),
                    } as unknown as AppModel,
                    projectModel: {} as ProjectModel,
                    schedulerClient:
                        appSendSchedulerClient as unknown as SchedulerClient,
                    slackClient: appSendSlackClient as unknown as SlackClient,
                    emailClient: {} as EmailClient,
                    userModel: {} as UserModel,
                    googleDriveClient: {} as GoogleDriveClient,
                    userService: {} as UserService,
                    jobModel: {} as JobModel,
                    spacePermissionService:
                        spacePermissionService as unknown as SpacePermissionService,
                });
                return { appSendService, appSendSchedulerClient };
            };

            const appSendActor = buildUser([
                {
                    subject: 'DataApp',
                    action: ['view'],
                    conditions: { organizationUuid },
                },
                {
                    subject: 'ScheduledDeliveries',
                    action: ['create'],
                    conditions: { organizationUuid },
                },
            ]);

            const appSendPayload = (
                format: SchedulerFormat,
                options: unknown,
            ) =>
                ({
                    name: 'send now app delivery',
                    format,
                    cron: '0 0 * * *',
                    timezone: 'UTC',
                    options,
                    savedChartUuid: null,
                    dashboardUuid: null,
                    savedSqlUuid: null,
                    appUuid: sendAppUuid,
                    createdBy: 'userUuid',
                    enabled: true,
                    includeLinks: true,
                    plainTextEmail: false,
                    targets: [{ recipient: 'recipient@example.com' }],
                }) as unknown as CreateSchedulerAndTargets;

            test.each([SchedulerFormat.GSHEETS, SchedulerFormat.PDF])(
                'rejects a %s send-now app payload',
                async (format) => {
                    const { appSendService, appSendSchedulerClient } =
                        buildAppSendService();

                    await expect(
                        appSendService.sendScheduler(
                            appSendActor,
                            appSendPayload(format, {}),
                        ),
                    ).rejects.toThrowError(ParameterError);

                    expect(
                        appSendSchedulerClient.addScheduledDeliveryJob,
                    ).not.toHaveBeenCalled();
                },
            );

            test('rejects a send-now app payload with a numeric csv limit', async () => {
                const { appSendService, appSendSchedulerClient } =
                    buildAppSendService();

                await expect(
                    appSendService.sendScheduler(
                        appSendActor,
                        appSendPayload(SchedulerFormat.CSV, {
                            formatted: true,
                            limit: 500,
                        }),
                    ),
                ).rejects.toThrowError(ParameterError);

                expect(
                    appSendSchedulerClient.addScheduledDeliveryJob,
                ).not.toHaveBeenCalled();
            });

            test('accepts a send-now csv app payload with limit table', async () => {
                const { appSendService, appSendSchedulerClient } =
                    buildAppSendService();

                await appSendService.sendScheduler(
                    appSendActor,
                    appSendPayload(SchedulerFormat.CSV, {
                        formatted: true,
                        limit: 'table',
                    }),
                );

                expect(
                    appSendSchedulerClient.addScheduledDeliveryJob,
                ).toHaveBeenCalledWith(
                    expect.any(Date),
                    expect.objectContaining({
                        format: SchedulerFormat.CSV,
                        appUuid: sendAppUuid,
                    }),
                    undefined,
                );
            });

            test('accepts a send-now csv app payload with limit all', async () => {
                const { appSendService, appSendSchedulerClient } =
                    buildAppSendService();

                await appSendService.sendScheduler(
                    appSendActor,
                    appSendPayload(SchedulerFormat.CSV, {
                        formatted: true,
                        limit: 'all',
                    }),
                );

                expect(
                    appSendSchedulerClient.addScheduledDeliveryJob,
                ).toHaveBeenCalledWith(
                    expect.any(Date),
                    expect.objectContaining({
                        format: SchedulerFormat.CSV,
                        appUuid: sendAppUuid,
                    }),
                    undefined,
                );
            });
        });
    });

    describe('getScheduler', () => {
        test('returns the scheduler when the user can view the underlying resource', async () => {
            const user = buildUser([
                { subject: 'Dashboard', action: ['view'] },
            ]);

            const result = await service.getScheduler(user, 'schedulerUuid');

            expect(result).toEqual(dashboardScheduler);
            expect(schedulerModel.getSchedulerAndTargets).toHaveBeenCalledWith(
                'schedulerUuid',
            );
        });

        test('throws ForbiddenError when the user cannot view the underlying resource', async () => {
            const user = buildUser([]);

            await expect(
                service.getScheduler(user, 'schedulerUuid'),
            ).rejects.toThrowError(ForbiddenError);
        });

        test('throws ForbiddenError when the user is not part of an organization', async () => {
            const user = {
                ...buildUser([{ subject: 'Dashboard', action: ['view'] }]),
                organizationUuid: undefined,
            } as unknown as SessionUser;

            await expect(
                service.getScheduler(user, 'schedulerUuid'),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                schedulerModel.getSchedulerAndTargets,
            ).not.toHaveBeenCalled();
        });
    });

    describe('getAppSchedulers', () => {
        const listAppUuid = 'listAppUuid';
        const listAppRow = {
            app_uuid: listAppUuid,
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            space_uuid: null,
            created_by_user_uuid: 'otherUserUuid',
            name: 'Sales App',
        };

        const viewDataApp: RawRuleOf<Ability<PossibleAbilities>> = {
            subject: 'DataApp',
            action: ['view'],
            conditions: { organizationUuid },
        };
        const createDeliveries: RawRuleOf<Ability<PossibleAbilities>> = {
            subject: 'ScheduledDeliveries',
            action: ['create'],
            conditions: { organizationUuid },
        };

        const buildAppListService = () => {
            const appListSchedulerModel = {
                getAppSchedulers: vi.fn(async () => []),
            };
            const appListService = new SchedulerService({
                lightdashConfig: lightdashConfigMock,
                analytics: analyticsMock,
                schedulerModel:
                    appListSchedulerModel as unknown as SchedulerModel,
                dashboardModel: {} as DashboardModel,
                savedChartModel: {} as SavedChartModel,
                savedSqlModel: {} as SavedSqlModel,
                appModel: {
                    findAppByUuid: vi.fn(async () => listAppRow),
                } as unknown as AppModel,
                projectModel: {} as ProjectModel,
                schedulerClient: {} as SchedulerClient,
                slackClient: {} as SlackClient,
                emailClient: {} as EmailClient,
                userModel: {} as UserModel,
                googleDriveClient: {} as GoogleDriveClient,
                userService: {} as UserService,
                jobModel: {} as JobModel,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
            });
            return { appListService, appListSchedulerModel };
        };

        test('returns only the requesting user’s schedulers when they cannot manage all deliveries', async () => {
            const { appListService, appListSchedulerModel } =
                buildAppListService();
            const user = buildUser([viewDataApp, createDeliveries]);

            await appListService.getAppSchedulers(user, listAppUuid);

            expect(appListSchedulerModel.getAppSchedulers).toHaveBeenCalledWith(
                listAppUuid,
                user.userUuid,
            );
        });

        test('returns every scheduler when the user can manage all deliveries', async () => {
            const { appListService, appListSchedulerModel } =
                buildAppListService();
            const user = buildUser([
                viewDataApp,
                createDeliveries,
                {
                    subject: 'ScheduledDeliveries',
                    action: ['manage'],
                    conditions: { organizationUuid },
                },
            ]);

            await appListService.getAppSchedulers(user, listAppUuid);

            expect(appListSchedulerModel.getAppSchedulers).toHaveBeenCalledWith(
                listAppUuid,
                undefined,
            );
        });

        test('throws ForbiddenError before listing when the user cannot create deliveries', async () => {
            const { appListService, appListSchedulerModel } =
                buildAppListService();
            const user = buildUser([viewDataApp]);

            await expect(
                appListService.getAppSchedulers(user, listAppUuid),
            ).rejects.toThrowError(ForbiddenError);
            expect(
                appListSchedulerModel.getAppSchedulers,
            ).not.toHaveBeenCalled();
        });
    });

    describe('reassignSchedulerOwner', () => {
        const gsheetsScheduler: ChartScheduler = {
            ...chartSchedulerInPrivateSpace,
            schedulerUuid: 'gsheetsSchedulerUuid',
            createdBy: 'currentOwnerUuid',
            format: SchedulerFormat.GSHEETS,
        };

        // manage:ScheduledDeliveries but NOT manage:GoogleSheets (custom role)
        const actorWithoutGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['manage'],
                conditions: { organizationUuid },
            },
        ]);

        const actorWithGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['manage'],
                conditions: { organizationUuid },
            },
            {
                subject: 'GoogleSheets',
                action: ['manage'],
                conditions: { organizationUuid },
            },
        ]);

        // create:ScheduledDeliveries but NOT create:GoogleSheets (custom role)
        const newOwnerWithoutGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['create'],
                conditions: { projectUuid },
            },
        ]);

        const newOwnerWithGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['create'],
                conditions: { projectUuid },
            },
            {
                subject: 'GoogleSheets',
                action: ['create'],
                conditions: { projectUuid },
            },
        ]);

        const buildReassignService = (newOwner: SessionUser) => {
            const projectModel = {
                getSummary: vi.fn(async () => ({
                    organizationUuid,
                    projectUuid,
                })),
            };
            const reassignSchedulerModel = {
                getSchedulersByUuid: vi.fn(async () => [gsheetsScheduler]),
                updateOwner: vi.fn(async () => {}),
            };
            const userModel = {
                findSessionUserAndOrgByUuid: vi.fn(async () => newOwner),
            };
            const userService = {
                getRefreshToken: vi.fn(async () => 'refresh-token'),
            };

            const reassignService = new SchedulerService({
                lightdashConfig: lightdashConfigMock,
                analytics: analyticsMock,
                schedulerModel:
                    reassignSchedulerModel as unknown as SchedulerModel,
                dashboardModel: {} as DashboardModel,
                savedChartModel: savedChartModel as unknown as SavedChartModel,
                savedSqlModel: {} as SavedSqlModel,
                appModel: {} as AppModel,
                projectModel: projectModel as unknown as ProjectModel,
                schedulerClient: schedulerClient as unknown as SchedulerClient,
                slackClient: {} as SlackClient,
                emailClient: {} as EmailClient,
                userModel: userModel as unknown as UserModel,
                googleDriveClient: {} as GoogleDriveClient,
                userService: userService as unknown as UserService,
                jobModel: {} as JobModel,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
            });

            return { reassignService, reassignSchedulerModel };
        };

        test('should throw ForbiddenError when actor lacks manage:GoogleSheets for a GSHEETS scheduler', async () => {
            const { reassignService, reassignSchedulerModel } =
                buildReassignService(newOwnerWithGoogleSheets);

            await expect(
                reassignService.reassignSchedulerOwner(
                    actorWithoutGoogleSheets,
                    projectUuid,
                    [gsheetsScheduler.schedulerUuid],
                    newOwnerWithGoogleSheets.userUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(reassignSchedulerModel.updateOwner).not.toHaveBeenCalled();
        });

        test('should throw ForbiddenError when new owner lacks manage:GoogleSheets for a GSHEETS scheduler', async () => {
            const { reassignService, reassignSchedulerModel } =
                buildReassignService(newOwnerWithoutGoogleSheets);

            await expect(
                reassignService.reassignSchedulerOwner(
                    actorWithGoogleSheets,
                    projectUuid,
                    [gsheetsScheduler.schedulerUuid],
                    newOwnerWithoutGoogleSheets.userUuid,
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(reassignSchedulerModel.updateOwner).not.toHaveBeenCalled();
        });

        test('should reassign GSHEETS scheduler when both actor and new owner have manage:GoogleSheets', async () => {
            const { reassignService, reassignSchedulerModel } =
                buildReassignService(newOwnerWithGoogleSheets);

            await reassignService.reassignSchedulerOwner(
                actorWithGoogleSheets,
                projectUuid,
                [gsheetsScheduler.schedulerUuid],
                newOwnerWithGoogleSheets.userUuid,
            );

            expect(reassignSchedulerModel.updateOwner).toHaveBeenCalledWith(
                [gsheetsScheduler.schedulerUuid],
                newOwnerWithGoogleSheets.userUuid,
            );
        });
    });

    describe('updateScheduler', () => {
        // The existing scheduler is CSV; the update switches it to GSHEETS
        const gsheetsUpdate = {
            name: 'scheduler',
            cron: '0 0 * * *',
            timezone: 'UTC',
            format: SchedulerFormat.GSHEETS,
            options: { gdriveId: 'gdriveId' },
            targets: [],
            savedChartUuid,
        } as unknown as UpdateSchedulerAndTargetsWithoutId;

        // manage:ScheduledDeliveries but NOT manage:GoogleSheets (custom role)
        const actorWithoutGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['manage'],
                conditions: { organizationUuid },
            },
        ]);

        const actorWithGoogleSheets = buildUser([
            {
                subject: 'ScheduledDeliveries',
                action: ['manage'],
                conditions: { organizationUuid },
            },
            {
                subject: 'GoogleSheets',
                action: ['manage'],
                conditions: { organizationUuid },
            },
        ]);

        const buildUpdateService = () => {
            const updateSchedulerModel = {
                getScheduler: vi.fn(async () => chartSchedulerInPrivateSpace),
                deleteScheduledLogs: vi.fn(async () => {}),
                updateScheduler: vi.fn(async () => ({
                    ...chartSchedulerInPrivateSpace,
                    format: SchedulerFormat.GSHEETS,
                    targets: [],
                    enabled: false,
                })),
            };
            const updateSchedulerClient = {
                deleteScheduledJobs: vi.fn(async () => {}),
            };

            const updateService = new SchedulerService({
                lightdashConfig: lightdashConfigMock,
                analytics: analyticsMock,
                schedulerModel:
                    updateSchedulerModel as unknown as SchedulerModel,
                dashboardModel: {} as DashboardModel,
                savedChartModel: savedChartModel as unknown as SavedChartModel,
                savedSqlModel: {} as SavedSqlModel,
                appModel: {} as AppModel,
                projectModel: {} as ProjectModel,
                schedulerClient:
                    updateSchedulerClient as unknown as SchedulerClient,
                slackClient: {
                    joinChannels: vi.fn(async () => {}),
                } as unknown as SlackClient,
                emailClient: {
                    canSendEmail: vi.fn(() => false),
                } as unknown as EmailClient,
                userModel: {} as UserModel,
                googleDriveClient: {} as GoogleDriveClient,
                userService: {} as UserService,
                jobModel: {} as JobModel,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
            });

            return { updateService, updateSchedulerModel };
        };

        test('should throw ForbiddenError when switching format to GSHEETS without manage:GoogleSheets', async () => {
            const { updateService, updateSchedulerModel } =
                buildUpdateService();

            await expect(
                updateService.updateScheduler(
                    actorWithoutGoogleSheets,
                    chartSchedulerInPrivateSpace.schedulerUuid,
                    gsheetsUpdate,
                    { validateGoogleSheet: false },
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(updateSchedulerModel.updateScheduler).not.toHaveBeenCalled();
        });

        test('should switch format to GSHEETS when user has manage:GoogleSheets', async () => {
            const { updateService, updateSchedulerModel } =
                buildUpdateService();

            await updateService.updateScheduler(
                actorWithGoogleSheets,
                chartSchedulerInPrivateSpace.schedulerUuid,
                gsheetsUpdate,
                { validateGoogleSheet: false },
            );

            expect(updateSchedulerModel.updateScheduler).toHaveBeenCalledWith({
                ...gsheetsUpdate,
                schedulerUuid: chartSchedulerInPrivateSpace.schedulerUuid,
            });
        });
    });

    describe('createAppScheduler', () => {
        const appUuid = 'appUuid';
        const appRow = {
            app_uuid: appUuid,
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            space_uuid: null,
            created_by_user_uuid: 'userUuid',
            name: 'Sales App',
        };

        const appActor = buildUser([
            {
                subject: 'DataApp',
                action: ['view'],
                conditions: { organizationUuid },
            },
            {
                subject: 'ScheduledDeliveries',
                action: ['create'],
                conditions: { organizationUuid },
            },
            {
                subject: 'GoogleSheets',
                action: ['manage'],
                conditions: { organizationUuid },
            },
        ]);

        // Same base grants as appActor, minus GoogleSheets — for asserting
        // the gsheets-only ability gate.
        const appActorWithoutGoogleSheetsAbility = buildUser([
            {
                subject: 'DataApp',
                action: ['view'],
                conditions: { organizationUuid },
            },
            {
                subject: 'ScheduledDeliveries',
                action: ['create'],
                conditions: { organizationUuid },
            },
        ]);

        // Defaults to a passing live Drive-file check, same as a real gsheets
        // file — tests that care about the check itself override it.
        const buildAppService = ({
            assertFileIsGoogleSheet = vi.fn().mockResolvedValue(undefined),
        }: {
            assertFileIsGoogleSheet?: ReturnType<typeof vi.fn>;
        } = {}) => {
            const appSchedulerModel = {
                createScheduler: vi.fn(async (scheduler) => ({
                    ...scheduler,
                    schedulerUuid: 'newSchedulerUuid',
                })),
            };
            const appSchedulerClient = {
                generateDailyJobsForScheduler: vi.fn(async () => {}),
            };
            const getRefreshToken = vi.fn().mockResolvedValue('refresh-token');
            const appService = new SchedulerService({
                lightdashConfig: lightdashConfigMock,
                analytics: analyticsMock,
                schedulerModel: appSchedulerModel as unknown as SchedulerModel,
                dashboardModel: {} as DashboardModel,
                savedChartModel: {} as SavedChartModel,
                savedSqlModel: {} as SavedSqlModel,
                appModel: {
                    findAppByUuid: vi.fn(async () => appRow),
                } as unknown as AppModel,
                projectModel: {
                    get: vi.fn(async () => ({ schedulerTimezone: 'UTC' })),
                } as unknown as ProjectModel,
                schedulerClient:
                    appSchedulerClient as unknown as SchedulerClient,
                slackClient: {
                    joinChannels: vi.fn(async () => {}),
                } as unknown as SlackClient,
                emailClient: {} as EmailClient,
                userModel: {} as UserModel,
                googleDriveClient: {
                    assertFileIsGoogleSheet,
                } as unknown as GoogleDriveClient,
                userService: {
                    getRefreshToken,
                } as unknown as UserService,
                jobModel: {} as JobModel,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
            });
            return {
                appService,
                appSchedulerModel,
                appSchedulerClient,
                assertFileIsGoogleSheet,
                getRefreshToken,
            };
        };

        const appSchedulerPayload = (
            format: SchedulerFormat,
            options: unknown,
        ) =>
            ({
                name: 'App delivery',
                cron: '0 9 * * *',
                timezone: 'UTC',
                format,
                options,
                enabled: true,
                includeLinks: true,
                plainTextEmail: false,
                targets: [],
            }) as unknown as Parameters<
                SchedulerService['createAppScheduler']
            >[2];

        test.each([
            SchedulerFormat.IMAGE,
            SchedulerFormat.CSV,
            SchedulerFormat.XLSX,
        ])('should accept %s deliveries', async (format) => {
            const { appService, appSchedulerModel } = buildAppService();

            await appService.createAppScheduler(
                appActor,
                appUuid,
                appSchedulerPayload(
                    format,
                    format === SchedulerFormat.IMAGE
                        ? {}
                        : { formatted: true, limit: 'table' },
                ),
            );

            expect(appSchedulerModel.createScheduler).toHaveBeenCalledWith(
                expect.objectContaining({ format, appUuid }),
            );
        });

        // Chart/dashboard creation enqueues the remaining same-day fires right
        // away; without this an app scheduler stayed dormant until the nightly
        // cron (or an enable toggle) generated its jobs.
        it('generates the daily jobs for the new scheduler', async () => {
            const { appService, appSchedulerClient } = buildAppService();

            const scheduler = await appService.createAppScheduler(
                appActor,
                appUuid,
                appSchedulerPayload(SchedulerFormat.CSV, {
                    formatted: true,
                    limit: 'table',
                }),
            );

            expect(
                appSchedulerClient.generateDailyJobsForScheduler,
            ).toHaveBeenCalledWith(
                scheduler,
                {
                    organizationUuid,
                    projectUuid,
                    userUuid: appActor.userUuid,
                },
                'UTC',
            );
        });

        // The scheduler row exists either way; the nightly cron or an enable
        // toggle recovers today's jobs.
        it('still creates the scheduler when job generation fails', async () => {
            const { appService, appSchedulerClient } = buildAppService();
            appSchedulerClient.generateDailyJobsForScheduler.mockRejectedValue(
                new Error('graphile unavailable'),
            );

            const scheduler = await appService.createAppScheduler(
                appActor,
                appUuid,
                appSchedulerPayload(SchedulerFormat.CSV, {
                    formatted: true,
                    limit: 'table',
                }),
            );

            expect(scheduler.schedulerUuid).toBe('newSchedulerUuid');
        });

        test.each([SchedulerFormat.PDF])(
            'should reject %s deliveries',
            async (format) => {
                const { appService, appSchedulerModel } = buildAppService();

                await expect(
                    appService.createAppScheduler(
                        appActor,
                        appUuid,
                        appSchedulerPayload(format, {}),
                    ),
                ).rejects.toThrowError(ParameterError);

                expect(
                    appSchedulerModel.createScheduler,
                ).not.toHaveBeenCalled();
            },
        );

        // The format gate lift makes app+GSHEETS schedulers possible via API;
        // no UI creates them yet.
        test('should accept gsheets deliveries with valid gsheets options', async () => {
            const { appService, appSchedulerModel, assertFileIsGoogleSheet } =
                buildAppService();

            await appService.createAppScheduler(
                appActor,
                appUuid,
                appSchedulerPayload(SchedulerFormat.GSHEETS, {
                    gdriveId: 'gdrive-1',
                    gdriveName: 'My sheet',
                    gdriveOrganizationName: 'My org',
                    url: 'https://docs.google.com/spreadsheets/d/gdrive-1',
                }),
            );

            expect(appSchedulerModel.createScheduler).toHaveBeenCalledWith(
                expect.objectContaining({
                    format: SchedulerFormat.GSHEETS,
                    appUuid,
                }),
            );
            expect(assertFileIsGoogleSheet).toHaveBeenCalledWith(
                'refresh-token',
                'gdrive-1',
            );
        });

        // Mirrors SavedChartService.createScheduler's live check for chart
        // gsheets schedulers, so PR 2 only has to build UI, not add
        // creation-time validation.
        test('should reject a gsheets delivery whose gdriveId is not a real Google Sheet', async () => {
            const { appService, appSchedulerModel, assertFileIsGoogleSheet } =
                buildAppService({
                    assertFileIsGoogleSheet: vi
                        .fn()
                        .mockRejectedValue(
                            new UnexpectedGoogleSheetsError(
                                'This operation is not supported for the provided file.',
                            ),
                        ),
                });

            await expect(
                appService.createAppScheduler(
                    appActor,
                    appUuid,
                    appSchedulerPayload(SchedulerFormat.GSHEETS, {
                        gdriveId: 'not-a-sheet',
                        gdriveName: 'My sheet',
                        gdriveOrganizationName: 'My org',
                        url: 'https://docs.google.com/spreadsheets/d/not-a-sheet',
                    }),
                ),
            ).rejects.toThrowError(UnexpectedGoogleSheetsError);

            expect(assertFileIsGoogleSheet).toHaveBeenCalledWith(
                'refresh-token',
                'not-a-sheet',
            );
            expect(appSchedulerModel.createScheduler).not.toHaveBeenCalled();
        });

        test.each([
            [SchedulerFormat.IMAGE, {}],
            [SchedulerFormat.CSV, { formatted: true, limit: 'table' }],
            [SchedulerFormat.XLSX, { formatted: true, limit: 'table' }],
        ] as const)(
            'does not run the live Drive-file check for %s app schedulers',
            async (format, options) => {
                const { appService, assertFileIsGoogleSheet } =
                    buildAppService();

                await appService.createAppScheduler(
                    appActor,
                    appUuid,
                    appSchedulerPayload(format, options),
                );

                expect(assertFileIsGoogleSheet).not.toHaveBeenCalled();
            },
        );

        test('should reject gsheets deliveries with non-gsheets options', async () => {
            const { appService, appSchedulerModel } = buildAppService();

            await expect(
                appService.createAppScheduler(
                    appActor,
                    appUuid,
                    appSchedulerPayload(SchedulerFormat.GSHEETS, {
                        formatted: true,
                        limit: 'table',
                    }),
                ),
            ).rejects.toThrowError(ParameterError);

            expect(appSchedulerModel.createScheduler).not.toHaveBeenCalled();
        });

        // Gsheets syncs are stateless — enforced here so the sync edit
        // path's clear-on-omit write to app_state stays a provable
        // null -> null no-op instead of an accidental invariant.
        test('should reject a gsheets delivery that carries app state', async () => {
            const { appService, appSchedulerModel } = buildAppService();

            await expect(
                appService.createAppScheduler(appActor, appUuid, {
                    ...appSchedulerPayload(SchedulerFormat.GSHEETS, {
                        gdriveId: 'gdrive-1',
                        gdriveName: 'My sheet',
                        gdriveOrganizationName: 'My org',
                        url: 'https://docs.google.com/spreadsheets/d/gdrive-1',
                    }),
                    appState: { tab: 'revenue' },
                } as unknown as Parameters<
                    SchedulerService['createAppScheduler']
                >[2]),
            ).rejects.toThrowError(ParameterError);

            expect(appSchedulerModel.createScheduler).not.toHaveBeenCalled();
        });

        test('should accept a gsheets delivery with app state explicitly null', async () => {
            const { appService, appSchedulerModel } = buildAppService();

            await appService.createAppScheduler(appActor, appUuid, {
                ...appSchedulerPayload(SchedulerFormat.GSHEETS, {
                    gdriveId: 'gdrive-1',
                    gdriveName: 'My sheet',
                    gdriveOrganizationName: 'My org',
                    url: 'https://docs.google.com/spreadsheets/d/gdrive-1',
                }),
                appState: null,
            } as unknown as Parameters<
                SchedulerService['createAppScheduler']
            >[2]);

            expect(appSchedulerModel.createScheduler).toHaveBeenCalledWith(
                expect.objectContaining({ format: SchedulerFormat.GSHEETS }),
            );
        });

        test('should still accept app state on csv/xlsx deliveries', async () => {
            const { appService, appSchedulerModel } = buildAppService();

            await appService.createAppScheduler(appActor, appUuid, {
                ...appSchedulerPayload(SchedulerFormat.CSV, {
                    formatted: true,
                    limit: 'table',
                }),
                appState: { tab: 'revenue' },
            } as unknown as Parameters<
                SchedulerService['createAppScheduler']
            >[2]);

            expect(appSchedulerModel.createScheduler).toHaveBeenCalledWith(
                expect.objectContaining({
                    format: SchedulerFormat.CSV,
                    appState: { tab: 'revenue' },
                }),
            );
        });

        // The sync entry point already gates on this ability client-side;
        // this makes the raw API enforce it too.
        test('should reject gsheets creation without the GoogleSheets ability', async () => {
            const { appService, appSchedulerModel } = buildAppService();

            await expect(
                appService.createAppScheduler(
                    appActorWithoutGoogleSheetsAbility,
                    appUuid,
                    appSchedulerPayload(SchedulerFormat.GSHEETS, {
                        gdriveId: 'gdrive-1',
                        gdriveName: 'My sheet',
                        gdriveOrganizationName: 'My org',
                        url: 'https://docs.google.com/spreadsheets/d/gdrive-1',
                    }),
                ),
            ).rejects.toThrowError(ForbiddenError);

            expect(appSchedulerModel.createScheduler).not.toHaveBeenCalled();
        });

        test('should not require the GoogleSheets ability for csv app scheduler creation', async () => {
            const { appService, appSchedulerModel } = buildAppService();

            await appService.createAppScheduler(
                appActorWithoutGoogleSheetsAbility,
                appUuid,
                appSchedulerPayload(SchedulerFormat.CSV, {
                    formatted: true,
                    limit: 'table',
                }),
            );

            expect(appSchedulerModel.createScheduler).toHaveBeenCalledWith(
                expect.objectContaining({ format: SchedulerFormat.CSV }),
            );
        });

        test.each([500, 0, -1])(
            'should reject a numeric csv limit of %s',
            async (limit) => {
                const { appService, appSchedulerModel } = buildAppService();

                await expect(
                    appService.createAppScheduler(
                        appActor,
                        appUuid,
                        appSchedulerPayload(SchedulerFormat.CSV, {
                            formatted: true,
                            limit,
                        }),
                    ),
                ).rejects.toThrowError(ParameterError);

                expect(
                    appSchedulerModel.createScheduler,
                ).not.toHaveBeenCalled();
            },
        );

        test('should accept a csv limit of all', async () => {
            const { appService, appSchedulerModel } = buildAppService();

            await appService.createAppScheduler(
                appActor,
                appUuid,
                appSchedulerPayload(SchedulerFormat.CSV, {
                    formatted: true,
                    limit: 'all',
                }),
            );

            expect(appSchedulerModel.createScheduler).toHaveBeenCalledWith(
                expect.objectContaining({
                    format: SchedulerFormat.CSV,
                    appUuid,
                }),
            );
        });

        // The generic PATCH /schedulers path is the only way to edit an app
        // scheduler, so the format gate has to hold there too.
        const buildAppUpdateService = () => {
            const existingAppScheduler = {
                ...chartSchedulerInPrivateSpace,
                savedChartUuid: null,
                appUuid,
                appName: 'Sales App',
                format: SchedulerFormat.IMAGE,
                options: {},
            };
            const appUpdateSchedulerModel = {
                getScheduler: vi.fn(async () => existingAppScheduler),
                updateScheduler: vi.fn(async () => ({
                    ...existingAppScheduler,
                    targets: [],
                })),
                deleteScheduledLogs: vi.fn(async () => {}),
            };
            const appUpdateService = new SchedulerService({
                lightdashConfig: lightdashConfigMock,
                analytics: analyticsMock,
                schedulerModel:
                    appUpdateSchedulerModel as unknown as SchedulerModel,
                dashboardModel: {} as DashboardModel,
                savedChartModel: {} as SavedChartModel,
                savedSqlModel: {} as SavedSqlModel,
                appModel: {
                    findAppByUuid: vi.fn(async () => appRow),
                } as unknown as AppModel,
                projectModel: {
                    get: vi.fn(async () => ({ schedulerTimezone: 'UTC' })),
                } as unknown as ProjectModel,
                schedulerClient: {
                    deleteScheduledJobs: vi.fn(async () => {}),
                    generateDailyJobsForScheduler: vi.fn(async () => {}),
                } as unknown as SchedulerClient,
                slackClient: {
                    joinChannels: vi.fn(async () => {}),
                } as unknown as SlackClient,
                emailClient: {
                    canSendEmail: vi.fn(() => false),
                } as unknown as EmailClient,
                userModel: {} as UserModel,
                googleDriveClient: {} as GoogleDriveClient,
                userService: {} as UserService,
                jobModel: {} as JobModel,
                spacePermissionService:
                    spacePermissionService as unknown as SpacePermissionService,
            });
            return { appUpdateService, appUpdateSchedulerModel };
        };

        const appUpdateActor = () =>
            buildUser([
                {
                    subject: 'ScheduledDeliveries',
                    action: ['manage'],
                    conditions: { organizationUuid },
                },
            ]);

        const appUpdatePayload = (format: SchedulerFormat, options: unknown) =>
            ({
                name: 'scheduler',
                cron: '0 0 * * *',
                timezone: 'UTC',
                format,
                options,
                targets: [],
            }) as unknown as UpdateSchedulerAndTargetsWithoutId;

        test('should reject a PDF format change on the generic update path', async () => {
            const { appUpdateService, appUpdateSchedulerModel } =
                buildAppUpdateService();

            await expect(
                appUpdateService.updateScheduler(
                    appUpdateActor(),
                    'schedulerUuid',
                    appUpdatePayload(SchedulerFormat.PDF, {}),
                ),
            ).rejects.toThrowError(ParameterError);

            expect(
                appUpdateSchedulerModel.updateScheduler,
            ).not.toHaveBeenCalled();
        });

        test('should reject a numeric csv limit change on the generic update path', async () => {
            const { appUpdateService, appUpdateSchedulerModel } =
                buildAppUpdateService();

            await expect(
                appUpdateService.updateScheduler(
                    appUpdateActor(),
                    'schedulerUuid',
                    appUpdatePayload(SchedulerFormat.CSV, {
                        formatted: true,
                        limit: 500,
                    }),
                ),
            ).rejects.toThrowError(ParameterError);

            expect(
                appUpdateSchedulerModel.updateScheduler,
            ).not.toHaveBeenCalled();
        });

        test('should allow a csv limit of all on the generic update path', async () => {
            const { appUpdateService, appUpdateSchedulerModel } =
                buildAppUpdateService();

            await appUpdateService.updateScheduler(
                appUpdateActor(),
                'schedulerUuid',
                appUpdatePayload(SchedulerFormat.CSV, {
                    formatted: true,
                    limit: 'all',
                }),
            );

            expect(
                appUpdateSchedulerModel.updateScheduler,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    schedulerUuid: 'schedulerUuid',
                    format: SchedulerFormat.CSV,
                }),
            );
        });

        test('should allow an image app scheduler update on the generic update path', async () => {
            const { appUpdateService, appUpdateSchedulerModel } =
                buildAppUpdateService();

            await appUpdateService.updateScheduler(
                appUpdateActor(),
                'schedulerUuid',
                appUpdatePayload(SchedulerFormat.IMAGE, { withPdf: false }),
            );

            expect(
                appUpdateSchedulerModel.updateScheduler,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    schedulerUuid: 'schedulerUuid',
                    format: SchedulerFormat.IMAGE,
                }),
            );
        });

        // validateGoogleSheet: false isolates the format-gate check from the
        // live Drive file check, which isn't part of this validation matrix.
        test('should allow a gsheets app scheduler update on the generic update path', async () => {
            const { appUpdateService, appUpdateSchedulerModel } =
                buildAppUpdateService();

            const actor = buildUser([
                {
                    subject: 'ScheduledDeliveries',
                    action: ['manage'],
                    conditions: { organizationUuid },
                },
                {
                    subject: 'GoogleSheets',
                    action: ['manage'],
                    conditions: { organizationUuid },
                },
            ]);

            await appUpdateService.updateScheduler(
                actor,
                'schedulerUuid',
                appUpdatePayload(SchedulerFormat.GSHEETS, {
                    gdriveId: 'gdrive-1',
                    gdriveName: 'My sheet',
                    gdriveOrganizationName: 'My org',
                    url: 'https://docs.google.com/spreadsheets/d/gdrive-1',
                }),
                { validateGoogleSheet: false },
            );

            expect(
                appUpdateSchedulerModel.updateScheduler,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    schedulerUuid: 'schedulerUuid',
                    format: SchedulerFormat.GSHEETS,
                }),
            );
        });

        test('should reject a gsheets app scheduler update that carries app state', async () => {
            const { appUpdateService, appUpdateSchedulerModel } =
                buildAppUpdateService();

            const actor = buildUser([
                {
                    subject: 'ScheduledDeliveries',
                    action: ['manage'],
                    conditions: { organizationUuid },
                },
                {
                    subject: 'GoogleSheets',
                    action: ['manage'],
                    conditions: { organizationUuid },
                },
            ]);

            await expect(
                appUpdateService.updateScheduler(
                    actor,
                    'schedulerUuid',
                    {
                        ...appUpdatePayload(SchedulerFormat.GSHEETS, {
                            gdriveId: 'gdrive-1',
                            gdriveName: 'My sheet',
                            gdriveOrganizationName: 'My org',
                            url: 'https://docs.google.com/spreadsheets/d/gdrive-1',
                        }),
                        appState: { tab: 'revenue' },
                    },
                    { validateGoogleSheet: false },
                ),
            ).rejects.toThrowError(ParameterError);

            expect(
                appUpdateSchedulerModel.updateScheduler,
            ).not.toHaveBeenCalled();
        });
    });
});
