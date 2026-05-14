import type {
    ToolDashboardArgs,
    ToolFindChartsArgs,
    ToolFindContentArgs,
    ToolFindDashboardsArgs,
    ToolFindExploresArgsV1,
    ToolFindExploresArgsV2,
    ToolFindExploresArgsV3,
    ToolFindFieldsArgs,
    ToolGetDashboardChartsArgs,
    ToolName,
    ToolRunQueryArgs,
    ToolSearchFieldValuesArgs,
    ToolTableVizArgs,
    ToolTimeSeriesArgs,
    ToolVerticalBarArgs,
} from '@lightdash/common';
import { type ToolCallSummary } from './types';

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
        case 'getDashboardCharts': {
            const args = toolArgs as ToolGetDashboardChartsArgs;
            return args.dashboardName ?? args.dashboardUuid ?? null;
        }
        case 'runSql':
        case 'runSavedChart':
        case 'listWarehouseTables':
        case 'describeWarehouseTable':
        case 'improveContext':
        case 'proposeChange':
            return null;
        default:
            return null;
    }
};
