import {
    ForbiddenError,
    type AnonymousAccount,
    type CreateEmbedJwt,
    type SessionUser,
} from '@lightdash/common';
import { EmbedService } from './EmbedService';
import {
    EmbedServiceArgumentsMock,
    mockAccountWithoutPermission,
    mockAccountWithPermission,
    mockOrganizationUuid,
    mockProjectUuid,
    mockUserUuid,
} from './EmbedService.mock';

describe('EmbedService', () => {
    let service: EmbedService;

    beforeEach(() => {
        service = new EmbedService(EmbedServiceArgumentsMock);
        jest.clearAllMocks();
    });

    describe('updateConfig', () => {
        const validDashboardUpdate = {
            dashboardUuids: ['dashboard-1', 'dashboard-2'],
            allowAllDashboards: false,
            chartUuids: [],
            allowAllCharts: false,
        };

        const validChartUpdate = {
            dashboardUuids: [],
            allowAllDashboards: false,
            chartUuids: ['chart-1', 'chart-2'],
            allowAllCharts: false,
        };

        const validBothUpdate = {
            dashboardUuids: ['dashboard-1'],
            allowAllDashboards: false,
            chartUuids: ['chart-1'],
            allowAllCharts: false,
        };

        describe('successful updates', () => {
            test('should successfully update config with dashboards', async () => {
                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    validDashboardUpdate,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(mockProjectUuid, validDashboardUpdate);
            });

            test('should successfully update config with charts only', async () => {
                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    validChartUpdate,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(mockProjectUuid, validChartUpdate);
            });

            test('should successfully update config with both dashboards and charts', async () => {
                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    validBothUpdate,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(mockProjectUuid, validBothUpdate);
            });

            test('should successfully update config with allowAllDashboards enabled', async () => {
                const allowAllDashboardsUpdate = {
                    dashboardUuids: [],
                    allowAllDashboards: true,
                    chartUuids: [],
                    allowAllCharts: false,
                };

                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    allowAllDashboardsUpdate,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(
                    mockProjectUuid,
                    allowAllDashboardsUpdate,
                );
            });

            test('should successfully update config with allowAllCharts enabled', async () => {
                const allowAllChartsUpdate = {
                    dashboardUuids: [],
                    allowAllDashboards: false,
                    chartUuids: [],
                    allowAllCharts: true,
                };

                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    allowAllChartsUpdate,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(mockProjectUuid, allowAllChartsUpdate);
            });

            test('should successfully update when both allowAll flags are true', async () => {
                const updateWithBothAllowAll = {
                    dashboardUuids: [],
                    allowAllDashboards: true,
                    chartUuids: [],
                    allowAllCharts: true,
                };

                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    updateWithBothAllowAll,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(mockProjectUuid, updateWithBothAllowAll);
            });

            test('allows empty ids to disable embedding', async () => {
                const update = {
                    dashboardUuids: [],
                    allowAllDashboards: false,
                    chartUuids: [],
                    allowAllCharts: false,
                };

                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    update,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(mockProjectUuid, update);
            });
        });

        describe('permission errors', () => {
            test('should throw ForbiddenError when user lacks update permission', async () => {
                await expect(
                    service.updateConfig(
                        mockAccountWithoutPermission,
                        mockProjectUuid,
                        validDashboardUpdate,
                    ),
                ).rejects.toThrow(ForbiddenError);

                // Verify embedModel.updateConfig was NOT called
                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).not.toHaveBeenCalled();
            });

            test('should throw ForbiddenError when embedding feature is disabled', async () => {
                // Mock feature flag as disabled for this test
                const featureFlagGet = EmbedServiceArgumentsMock
                    .featureFlagModel.get as jest.Mock;
                featureFlagGet.mockResolvedValueOnce({ enabled: false });

                await expect(
                    service.updateConfig(
                        mockAccountWithPermission,
                        mockProjectUuid,
                        validDashboardUpdate,
                    ),
                ).rejects.toThrow('Feature not enabled');
            });
        });

        describe('edge cases', () => {
            test('should handle chartUuids being undefined when dashboards are provided', async () => {
                const updateWithUndefinedCharts = {
                    dashboardUuids: ['dashboard-1'],
                    allowAllDashboards: false,
                    chartUuids: undefined,
                    allowAllCharts: false,
                };

                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    updateWithUndefinedCharts,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(
                    mockProjectUuid,
                    updateWithUndefinedCharts,
                );
            });

            test('should handle allowAllCharts being undefined when dashboards are provided', async () => {
                const updateWithUndefinedAllowAllCharts = {
                    dashboardUuids: ['dashboard-1'],
                    allowAllDashboards: false,
                    chartUuids: ['chart-1'],
                    allowAllCharts: undefined,
                };

                await service.updateConfig(
                    mockAccountWithPermission,
                    mockProjectUuid,
                    updateWithUndefinedAllowAllCharts,
                );

                expect(
                    EmbedServiceArgumentsMock.embedModel.updateConfig,
                ).toHaveBeenCalledWith(
                    mockProjectUuid,
                    updateWithUndefinedAllowAllCharts,
                );
            });
        });
    });

    describe('getContentUuidFromJwt', () => {
        test('resolves standalone dataApp content carrying the appUuid', async () => {
            const content = await service.getContentUuidFromJwt(
                {
                    content: { type: 'dataApp', appUuid: 'app-123' },
                    exp: Date.now() / 1000 + 3600,
                },
                mockProjectUuid,
            );
            expect(content).toEqual({
                appUuid: 'app-123',
                dashboardUuid: undefined,
                chartUuids: [],
                type: 'dataApp',
                explores: [],
            });
        });
    });

    describe('getEmbedWriteUser', () => {
        test('uses apiAccess service account over writeActions user', async () => {
            const serviceAccountUserUuid = 'service-account-user-uuid';
            const userModel = {
                findSessionUserAndOrgByUuid: jest.fn().mockResolvedValue({
                    userUuid: serviceAccountUserUuid,
                    isActive: false,
                }),
                findServiceAccountByUserUuid: jest.fn().mockResolvedValue({
                    uuid: 'service-account-uuid',
                    organizationUuid: mockOrganizationUuid,
                    description: 'Embedded customer actions',
                }),
            };
            const scopedService = new EmbedService({
                ...EmbedServiceArgumentsMock,
                userModel,
            } as unknown as ConstructorParameters<typeof EmbedService>[0]);
            const getEmbedWriteUser = (
                scopedService as unknown as {
                    getEmbedWriteUser: (
                        decodedToken: CreateEmbedJwt,
                        organizationUuid: string,
                    ) => Promise<SessionUser | undefined>;
                }
            ).getEmbedWriteUser.bind(scopedService);

            const embedWriteUser = await getEmbedWriteUser(
                {
                    content: {
                        type: 'apiAccess',
                        serviceAccountUserUuid,
                    },
                    writeActions: {
                        spaceUuid: 'legacy-space-uuid',
                        userUuid: mockUserUuid,
                    },
                },
                mockOrganizationUuid,
            );

            expect(userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
                serviceAccountUserUuid,
                mockOrganizationUuid,
            );
            expect(userModel.findServiceAccountByUserUuid).toHaveBeenCalledWith(
                serviceAccountUserUuid,
            );
            expect(embedWriteUser).toEqual(
                expect.objectContaining({
                    userUuid: serviceAccountUserUuid,
                    serviceAccount: {
                        uuid: 'service-account-uuid',
                        description: 'Embedded customer actions',
                    },
                }),
            );
        });
    });

    describe('getEmbedUserAttributes', () => {
        const embedJwt = {
            content: { type: 'dashboard', dashboardUuid: 'dashboard-1' },
            exp: Date.now() / 1000 + 3600,
        } as CreateEmbedJwt;

        const getServiceWithUserAttributes = (
            orgUserAttributes: Array<{
                name: string;
                attributeDefault: string | null;
            }> = [],
        ) =>
            new EmbedService({
                ...EmbedServiceArgumentsMock,
                userAttributesModel: {
                    find: jest.fn().mockResolvedValue(orgUserAttributes),
                },
            } as unknown as ConstructorParameters<typeof EmbedService>[0]);

        test('returns safe JWT user attributes and intrinsic email', async () => {
            const scopedService = getServiceWithUserAttributes([
                { name: 'region', attributeDefault: 'default-region' },
                { name: 'tier', attributeDefault: 'enterprise' },
            ]);

            await expect(
                scopedService.getEmbedUserAttributes(mockOrganizationUuid, {
                    ...embedJwt,
                    user: { email: 'viewer@example.com' },
                    userAttributes: {
                        region: 'EMEA',
                    },
                }),
            ).resolves.toEqual({
                intrinsicUserAttributes: {
                    email: 'viewer@example.com',
                },
                userAttributes: {
                    region: ['EMEA'],
                    tier: ['enterprise'],
                },
            });
        });

        test('escapes JWT user attribute values', async () => {
            const scopedService = getServiceWithUserAttributes();

            await expect(
                scopedService.getEmbedUserAttributes(mockOrganizationUuid, {
                    ...embedJwt,
                    userAttributes: {
                        region: "EU' UNION SELECT email FROM users --",
                    },
                }),
            ).resolves.toMatchObject({
                userAttributes: {
                    region: ["EU'' UNION SELECT email FROM users --"],
                },
            });
        });

        test('escapes JWT intrinsic email values', async () => {
            const scopedService = getServiceWithUserAttributes();

            await expect(
                scopedService.getEmbedUserAttributes(mockOrganizationUuid, {
                    ...embedJwt,
                    user: {
                        email: "x'/**/OR/**/1=1/**/--@example.com",
                    },
                }),
            ).resolves.toMatchObject({
                intrinsicUserAttributes: {
                    email: "x''/**/OR/**/1=1/**/--@example.com",
                },
            });
        });
    });

    describe('searchFilterValues', () => {
        test('scopes dashboard lookup to the requested project', async () => {
            const dashboardUuid = 'dashboard-1';
            const dashboardModel = {
                getByIdOrSlug: jest.fn().mockRejectedValue(new Error('stop')),
            };
            const embedModel = {
                get: jest.fn().mockResolvedValue({
                    dashboardUuids: [dashboardUuid],
                    allowAllDashboards: false,
                    user: {
                        userUuid: mockUserUuid,
                    },
                }),
            };
            const scopedService = new EmbedService({
                ...EmbedServiceArgumentsMock,
                dashboardModel,
                embedModel,
            } as unknown as ConstructorParameters<typeof EmbedService>[0]);
            const account = {
                authentication: {
                    type: 'jwt',
                    source: 'embed-token',
                    data: {
                        content: {
                            type: 'dashboard',
                        },
                    },
                },
                access: {
                    content: {
                        dashboardUuid,
                    },
                },
                user: {
                    id: mockUserUuid,
                },
                organization: {
                    organizationUuid: mockOrganizationUuid,
                },
                isAnonymousUser: jest.fn().mockReturnValue(true),
            } as unknown as AnonymousAccount;

            await expect(
                scopedService.searchFilterValues({
                    account,
                    projectUuid: mockProjectUuid,
                    filterUuid: 'filter-uuid',
                    search: 'search',
                    limit: 10,
                    filters: undefined,
                    forceRefresh: false,
                }),
            ).rejects.toThrow('stop');

            expect(dashboardModel.getByIdOrSlug).toHaveBeenCalledWith(
                dashboardUuid,
                { projectUuid: mockProjectUuid },
            );
        });
    });
});
