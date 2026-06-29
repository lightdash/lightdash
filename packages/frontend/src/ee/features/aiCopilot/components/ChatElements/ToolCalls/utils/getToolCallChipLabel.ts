import type {
    DiscoverFieldsInput,
    ToolDashboardArgs,
    ToolDescribeWarehouseTableArgs,
    ToolFindChartsArgs,
    ToolFindContentArgs,
    ToolFindDashboardsArgs,
    ToolFindExploresArgsV1,
    ToolFindExploresArgsV2,
    ToolFindExploresArgsV3,
    ToolFindFieldsArgs,
    ToolGetDashboardChartsArgs,
    ToolListContentArgs,
    ToolListFieldsArgs,
    ToolListWarehouseTablesArgs,
    ToolRunContentQueryArgs,
    ToolRunQueryArgs,
    ToolSearchFieldValuesArgs,
    ToolSearchSemanticLayerArgs,
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from '@lightdash/common';
import { type ActivityToolName } from './activityToolNames';
import { type ToolCallSummary } from './types';

type ToolReadContentArgs = {
    slug?: string;
};

type ToolEditContentArgs = {
    slug?: string;
};

type ToolCreateContentArgs = {
    content?: { slug?: string };
};

/**
 * Returns a short label representing a single tool call. Used to render each
 * call as a chip when the same tool is invoked multiple times in a row, and
 * for the inline single-call preview. Returns null when the tool's args don't
 * lend themselves to a short label.
 */
export const getToolCallChipLabel = (
    toolName: ActivityToolName,
    toolArgs: ToolCallSummary['toolArgs'],
): string | null => {
    // toolArgs can be undefined mid-stream before the model has sent any
    // input chunks for the call. Bail before any cast-and-access pattern.
    if (!toolArgs || typeof toolArgs !== 'object') return null;
    switch (toolName) {
        case 'generateBarVizConfig':
        case 'generateTableVizConfig':
        case 'generateTimeSeriesVizConfig': {
            const args = toolArgs as
                | ToolTableVizArgs
                | ToolTimeSeriesArgs
                | ToolVerticalBarArgs;
            return args.title ?? null;
        }
        case 'generateDashboard': {
            const args = toolArgs as ToolDashboardArgs;
            return args.title ?? null;
        }
        case 'generateVisualization':
        case 'runQuery': {
            const args = toolArgs as ToolRunQueryArgs;
            return args.title ?? null;
        }
        case 'findExplores': {
            const args = toolArgs as
                | ToolFindExploresArgsV3
                | ToolFindExploresArgsV2
                | ToolFindExploresArgsV1;
            if ('searchQuery' in args && args.searchQuery)
                return args.searchQuery;
            if ('exploreName' in args && args.exploreName)
                return args.exploreName;
            return null;
        }
        case 'findFields': {
            const args = toolArgs as ToolFindFieldsArgs;
            return args.fieldSearchQueries?.[0]?.label ?? null;
        }
        case 'listFields': {
            const args = toolArgs as ToolListFieldsArgs;
            return args.fields?.[0]?.fieldId ?? null;
        }
        case 'listExplores':
            return 'available explores';
        case 'discoverFields': {
            const args = toolArgs as DiscoverFieldsInput;
            return args.userQuery ?? null;
        }
        case 'findContent': {
            const args = toolArgs as ToolFindContentArgs;
            return args.searchQueries?.[0]?.label ?? null;
        }
        case 'findDashboards': {
            const args = toolArgs as ToolFindDashboardsArgs;
            return args.dashboardSearchQueries?.[0]?.label ?? null;
        }
        case 'findCharts': {
            const args = toolArgs as ToolFindChartsArgs;
            return args.chartSearchQueries?.[0]?.label ?? null;
        }
        case 'searchFieldValues': {
            const args = toolArgs as ToolSearchFieldValuesArgs;
            return args.query ?? args.fieldId ?? null;
        }
        case 'searchSemanticLayer': {
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
        }
        case 'getDashboardCharts': {
            const args = toolArgs as ToolGetDashboardChartsArgs;
            return args.dashboardName ?? args.dashboardUuid ?? null;
        }
        case 'describeWarehouseTable': {
            const args = toolArgs as ToolDescribeWarehouseTableArgs;
            if (!args.table) return null;
            return args.schema ? `${args.schema}.${args.table}` : args.table;
        }
        case 'listWarehouseTables': {
            const args = toolArgs as ToolListWarehouseTablesArgs;
            return args.schema ?? args.search ?? null;
        }
        case 'listContent': {
            const args = toolArgs as ToolListContentArgs;
            return args.spaceSlug ?? 'root';
        }
        case 'readContent': {
            const args = toolArgs as ToolReadContentArgs;
            return args.slug ?? null;
        }
        case 'editContent': {
            const args = toolArgs as ToolEditContentArgs;
            return args.slug ?? null;
        }
        case 'createContent': {
            const args = toolArgs as ToolCreateContentArgs;
            return args.content?.slug ?? null;
        }
        case 'exploreRepo': {
            const args = toolArgs as { command?: string; target?: string };
            if (args.target && args.command)
                return `${args.target}: ${args.command}`;
            return args.command ?? args.target ?? null;
        }
        case 'submitResult': {
            const args = toolArgs as {
                handoff?: {
                    status?: string;
                    exploreName?: string;
                    dimensionIds?: string[];
                    metricIds?: string[];
                    candidates?: unknown[];
                };
            };
            const handoff = args.handoff;
            if (handoff?.status === 'resolved') {
                const fieldCount =
                    (handoff.dimensionIds?.length ?? 0) +
                    (handoff.metricIds?.length ?? 0);
                return handoff.exploreName
                    ? `${handoff.exploreName}: ${fieldCount} fields`
                    : `${fieldCount} fields`;
            }
            if (handoff?.status === 'ambiguous') {
                return `${handoff.candidates?.length ?? 0} candidates`;
            }
            return handoff?.status ?? null;
        }
        case 'discoverRepos':
            return null;
        case 'runSql':
        case 'runSavedChart':
        case 'generateHashes':
        case 'improveContext':
        case 'proposeChange':
            return null;
        case 'runContentQuery': {
            const args = toolArgs as ToolRunContentQueryArgs;
            if (args.source.type === 'metricQuery')
                return args.source.tableName;
            if (args.source.type === 'dashboardChart') {
                return `${args.source.dashboardSlug}: ${args.source.chartSlug}`;
            }
            return args.source.chartSlug;
        }
        case 'loadProjectContext': {
            const args = toolArgs as { search?: string | null };
            return args.search ?? null;
        }
        case 'loadSkill': {
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
        }
        default:
            return null;
    }
};
