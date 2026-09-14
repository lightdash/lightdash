import type { McpServerToolOptions } from './McpService';

export const makeMcpServerOptions = (
    featureAvailability: Partial<
        McpServerToolOptions['featureAvailability']
    > = {},
    pinnedProjectUuid?: string,
): McpServerToolOptions => ({
    req: { pinnedProjectUuid },
    featureAvailability: {
        mcpContentWritesEnabled: true,
        scheduledDeliveryEnabled: true,
        runSqlEnabled: false,
        runMetricQueryEnabled: false,
        filterExpressionsEnabled: false,
        ...featureAvailability,
    },
});
