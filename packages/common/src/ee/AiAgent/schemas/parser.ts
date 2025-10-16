import assertUnreachable from '../../../utils/assertUnreachable';
import {
    toolDashboardArgsSchemaTransformed,
    toolFindChartsArgsSchemaTransformed,
    toolFindDashboardsArgsSchemaTransformed,
    toolFindExploresArgsSchemaTransformed,
    toolFindFieldsArgsSchemaTransformed,
    toolImproveContextArgsSchema,
    toolProposeChangeArgsSchema,
    toolRunQueryArgsSchemaTransformed,
    toolSearchFieldValuesArgsSchemaTransformed,
    toolTableVizArgsSchemaTransformed,
    toolTimeSeriesArgsSchemaTransformed,
    toolVerticalBarArgsSchemaTransformed,
} from './tools';
import { type ToolName } from './visualizations';

/**
 * Parse the tool args using the specific schema for each tool name
 * @param toolName - The name of the tool to parse
 * @param toolArgs - The tool args to parse
 * @returns The parsed tool args
 */
export const parseToolArgs = (toolName: ToolName, toolArgs: unknown) => {
    switch (toolName) {
        case 'findExplores':
            return toolFindExploresArgsSchemaTransformed.safeParse(toolArgs);
        case 'findFields':
            return toolFindFieldsArgsSchemaTransformed.safeParse(toolArgs);
        case 'searchFieldValues':
            return toolSearchFieldValuesArgsSchemaTransformed.safeParse(
                toolArgs,
            );
        case 'generateBarVizConfig':
            return toolVerticalBarArgsSchemaTransformed.safeParse(toolArgs);
        case 'generateTableVizConfig':
            return toolTableVizArgsSchemaTransformed.safeParse(toolArgs);
        case 'generateTimeSeriesVizConfig':
            return toolTimeSeriesArgsSchemaTransformed.safeParse(toolArgs);
        case 'generateDashboard':
            return toolDashboardArgsSchemaTransformed.safeParse(toolArgs);
        case 'findDashboards':
            return toolFindDashboardsArgsSchemaTransformed.safeParse(toolArgs);
        case 'findCharts':
            return toolFindChartsArgsSchemaTransformed.safeParse(toolArgs);
        case 'improveContext':
            return toolImproveContextArgsSchema.safeParse(toolArgs);
        case 'proposeChange':
            return toolProposeChangeArgsSchema.safeParse(toolArgs);
        case 'runQuery':
            return toolRunQueryArgsSchemaTransformed.safeParse(toolArgs);
        default:
            return assertUnreachable(
                toolName,
                `Unknown tool name: ${toolName}`,
            );
    }
};
