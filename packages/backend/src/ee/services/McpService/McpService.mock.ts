import type { McpServerToolOptions } from './McpService';

export const makeMcpServerOptions = (
    featureAvailability: Partial<
        McpServerToolOptions['featureAvailability']
    > = {},
    pinnedProjectUuid?: string,
): McpServerToolOptions => ({
    req: {
        pinnedAgent: null,
        pinnedProjectUuid,
        user: undefined,
        account: undefined,
    },
    featureAvailability: {
        mcpContentWritesEnabled: true,
        scheduledDeliveryEnabled: true,
        runSqlEnabled: false,
        runMetricQueryEnabled: false,
        queryEnabled: false,
        filterExpressionsEnabled: false,
        documentsEnabled: false,
        dataAppBuildsEnabled: false,
        chartTypeBuildsEnabled: false,
        customChartTypesEnabled: false,
        agentIdentityEnabled: false,
        ...featureAvailability,
    },
});
