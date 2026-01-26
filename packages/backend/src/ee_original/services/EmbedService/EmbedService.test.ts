import { ForbiddenError, ParameterError } from '@lightdash/common';
import { EmbedService } from './EmbedService';
import {
    EmbedServiceArgumentsMock,
    mockAccountWithoutPermission,
    mockAccountWithPermission,
    mockProjectUuid,
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
});
