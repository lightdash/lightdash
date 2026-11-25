import type { McpQueryPath } from './mcpQueryPath';
import type { McpServerToolOptions } from './McpService';

export const classicQueryPath = (
    sqlRunnerEnabled: boolean,
    filterExpressionsEnabled: boolean,
): McpQueryPath => ({
    type: 'classic',
    sqlRunnerEnabled,
    filterExpressionsEnabled,
});

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
        queryPath: { type: 'contentOnly' },
        documentsEnabled: false,
        dataAppBuildsEnabled: false,
        chartTypeBuildsEnabled: false,
        customChartTypesEnabled: false,
        agentIdentityEnabled: false,
        ...featureAvailability,
    },
});
