import type {
    DiscoverFieldsInput,
    ToolGrepFieldsArgs,
    ToolGetMetadataArgs,
    ToolDashboardV2Args,
    ToolDescribeWarehouseTableArgs,
    ToolFindChartsArgs,
    ToolFindContentArgs,
    ToolFindCustomChartTypesArgs,
    ToolFindDashboardsArgs,
    ToolFindExploresArgsV1,
    ToolFindExploresArgsV2,
    ToolFindExploresArgsV3,
    ToolFindFieldsArgs,
    ToolGetDashboardChartsArgs,
    ToolListContentArgs,
    ToolListWarehouseTablesArgs,
    ToolName,
    ToolResolveUrlArgs,
    ToolRunContentQueryArgs,
    ToolRunQueryArgs,
    ToolSearchFieldValuesArgs,
    ToolSearchSemanticLayerArgs,
} from '@lightdash/common';
import { type ToolCallSummary } from './types';

type ToolReadContentArgs = {
    slug?: string;
    documentUuid?: string;
};

type ToolEditContentArgs = {
    slug?: string;
};

type ToolCreateContentArgs = {
    content?: { slug?: string };
};

type ToolCallChipLabelFn = (toolArgs: object) => string | null;

/**
 * Per-tool chip labels. Tools omitted here (and unknown names) return null,
 * matching the previous switch default.
 */
const CHIP_LABEL_BY_TOOL: Partial<Record<ToolName, ToolCallChipLabelFn>> = {
    generateDashboard: (toolArgs) => {
        const args = toolArgs as ToolDashboardV2Args;
        return args.title ?? null;
    },
    generateVisualization: (toolArgs) => {
        const args = toolArgs as ToolRunQueryArgs;
        return args.title ?? null;
    },
    runQuery: (toolArgs) => {
        const args = toolArgs as ToolRunQueryArgs;
        return args.title ?? null;
    },
    findExplores: (toolArgs) => {
        const args = toolArgs as
            | ToolFindExploresArgsV3
            | ToolFindExploresArgsV2
            | ToolFindExploresArgsV1;
        if ('searchQuery' in args && args.searchQuery) return args.searchQuery;
        if ('exploreName' in args && args.exploreName) return args.exploreName;
        return null;
    },
    findFields: (toolArgs) => {
        const args = toolArgs as ToolFindFieldsArgs;
        return args.fieldSearchQueries?.[0]?.label ?? null;
    },
    findCustomChartTypes: (toolArgs) => {
        const args = toolArgs as ToolFindCustomChartTypesArgs;
        return args.query ?? args.slug ?? null;
    },
    discoverFields: (toolArgs) => {
        const args = toolArgs as DiscoverFieldsInput;
        return args.userQuery ?? null;
    },
    grepFields: (toolArgs) => {
        const args = toolArgs as ToolGrepFieldsArgs;
        return args.patterns?.length
            ? args.patterns.map((p) => `/${p}/`).join(' ')
            : null;
    },
    getMetadata: (toolArgs) => {
        const args = toolArgs as ToolGetMetadataArgs;
        const names = (args.requests ?? []).flatMap((r) =>
            r.type === 'explore'
                ? r.exploreIds
                : r.fields.map((f) => f.fieldId),
        );
        return names.length ? names.join(', ') : null;
    },
    findContent: (toolArgs) => {
        const args = toolArgs as ToolFindContentArgs;
        return args.searchQueries?.[0]?.label ?? null;
    },
    findDashboards: (toolArgs) => {
        const args = toolArgs as ToolFindDashboardsArgs;
        return args.dashboardSearchQueries?.[0]?.label ?? null;
    },
    findCharts: (toolArgs) => {
        const args = toolArgs as ToolFindChartsArgs;
        return args.chartSearchQueries?.[0]?.label ?? null;
    },
    searchFieldValues: (toolArgs) => {
        const args = toolArgs as ToolSearchFieldValuesArgs;
        return args.query ?? args.fieldId ?? null;
    },
    searchSemanticLayer: (toolArgs) => {
        const args = toolArgs as ToolSearchSemanticLayerArgs;
        const fieldType =
            args.type === 'metric'
                ? 'metrics'
                : args.type === 'dimension'
                  ? 'dimensions'
                  : 'fields';
        return args.searchQuery
            ? `${fieldType}: ${args.searchQuery}`
            : fieldType;
    },
    getDashboardCharts: (toolArgs) => {
        const args = toolArgs as ToolGetDashboardChartsArgs;
        return args.dashboardName ?? args.dashboardUuid ?? null;
    },
    describeWarehouseTable: (toolArgs) => {
        const args = toolArgs as ToolDescribeWarehouseTableArgs;
        if (!args.table) return null;
        return args.schema ? `${args.schema}.${args.table}` : args.table;
    },
    listWarehouseTables: (toolArgs) => {
        const args = toolArgs as ToolListWarehouseTablesArgs;
        return args.schema ?? args.search ?? null;
    },
    listContent: (toolArgs) => {
        const args = toolArgs as ToolListContentArgs;
        return args.spaceSlug ?? 'root';
    },
    readContent: (toolArgs) => {
        const args = toolArgs as ToolReadContentArgs;
        return args.slug ?? args.documentUuid ?? null;
    },
    resolveUrl: (toolArgs) => {
        const args = toolArgs as ToolResolveUrlArgs;
        return args.url ?? null;
    },
    editContent: (toolArgs) => {
        const args = toolArgs as ToolEditContentArgs;
        return args.slug ?? null;
    },
    createContent: (toolArgs) => {
        const args = toolArgs as ToolCreateContentArgs;
        return args.content?.slug ?? null;
    },
    createScheduledDelivery: (toolArgs) => {
        const args = toolArgs as { name?: string };
        return args.name ?? null;
    },
    exploreRepo: (toolArgs) => {
        const args = toolArgs as { command?: string; target?: string };
        if (args.target && args.command)
            return `${args.target}: ${args.command}`;
        return args.command ?? args.target ?? null;
    },
    runComposerQueries: (toolArgs) => {
        const args = toolArgs as { title?: string | null };
        return args.title ?? null;
    },
    runContentQuery: (toolArgs) => {
        const args = toolArgs as ToolRunContentQueryArgs;
        if (args.source?.type === 'metricQuery') return args.source.tableName;
        if (args.source?.type === 'dashboardChart') {
            return `${args.source.dashboardSlug}: ${args.source.chartSlug}`;
        }
        return args.source?.chartSlug ?? null;
    },
    loadProjectContext: (toolArgs) => {
        const args = toolArgs as { search?: string | null };
        return args.search ?? null;
    },
    loadSkill: (toolArgs) => {
        const args = toolArgs as {
            name?: string;
            resourceName?: string;
        };
        if (args.resourceName && args.name) {
            return `${args.resourceName} from ${args.name}`;
        }
        if (args.name) {
            return `skill: ${args.name}`;
        }
        return args.resourceName ?? null;
    },
};

/**
 * Returns a short label representing a single tool call. Used to render each
 * call as a chip when the same tool is invoked multiple times in a row, and
 * for the inline single-call preview. Returns null when the tool's args don't
 * lend themselves to a short label.
 */
export const getToolCallChipLabel = (
    toolName: ToolName,
    toolArgs: ToolCallSummary['toolArgs'],
): string | null => {
    // toolArgs can be undefined mid-stream before the model has sent any
    // input chunks for the call. Bail before any cast-and-access pattern.
    if (!toolArgs || typeof toolArgs !== 'object') return null;
    const getLabel = CHIP_LABEL_BY_TOOL[toolName];
    return getLabel ? getLabel(toolArgs) : null;
};
