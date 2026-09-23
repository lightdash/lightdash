import type { McpServerToolOptions } from './McpService';

export const makeMcpServerOptions = (
    featureAvailability: Partial<
        McpServerToolOptions['featureAvailability']
    > = {},
    pinnedProjectUuid?: string,
): McpServerToolOptions => ({
    req: { pinnedProjectUuid, user: undefined, account: undefined },
    featureAvailability: {
        mcpContentWritesEnabled: true,
        scheduledDeliveryEnabled: true,
        runSqlEnabled: false,
        runMetricQueryEnabled: false,
        filterExpressionsEnabled: false,
        documentsEnabled: false,
        dataAppBuildsEnabled: false,
        ...featureAvailability,
    },
});
