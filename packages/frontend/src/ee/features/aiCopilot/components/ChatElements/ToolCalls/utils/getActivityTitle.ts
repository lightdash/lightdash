import {
    isComposerQueryToolName,
    type AiAgentToolResult,
} from '@lightdash/common';
import {
    IconChartLine,
    IconLayoutDashboard,
    IconRoute,
    IconSearch,
    type TablerIcon,
} from '@tabler/icons-react';
import { type LiveActivityToolGroup } from '../LiveActivityCard';
import { isToolCallFailed, isToolCallUnapproved } from './toolCallFailure';

type ActivityTitle = {
    title: string;
    icon: TablerIcon;
};

const SEARCH_TOOLS = new Set([
    'findExplores',
    'findCustomChartTypes',
    'findFields',
    'discoverFields',
    'grepFields',
    'getMetadata',
    'searchSemanticLayer',
    'searchFieldValues',
    'findContent',
    'listContent',
    'findDashboards',
    'findCharts',
    'getDashboardCharts',
    'listWarehouseTables',
    'describeWarehouseTable',
    'listKnowledgeDocuments',
    'getKnowledgeDocumentContent',
    'resolveUrl',
]);

const LAYER_CHANGE_TOOLS = new Set([
    'proposeSemanticLayerChange',
    'editDbtProject',
    'write',
]);

const QUERY_TOOLS = new Set([
    'generateVisualization',
    'runContentQuery',
    'runQuery',
]);

/**
 * Summarizes a finished agent run into one opinionated title shown in the
 * activity bento. The title morphs based on what tools the agent actually
 * used; "built" titles need a call that succeeded, i.e. produced the output.
 */
export const getActivityTitle = (
    toolGroups: LiveActivityToolGroup[],
    toolResults?: AiAgentToolResult[],
): ActivityTitle => {
    if (toolGroups.length === 0) {
        return { title: 'Steps taken', icon: IconRoute };
    }
    const calls = toolGroups.flatMap((g) => g.calls);
    const toolNames = calls.map((call) => call.toolName);
    const succeeded = (isTool: (toolName: string) => boolean) =>
        calls.some(
            (call) =>
                isTool(call.toolName) &&
                !isToolCallFailed(call, toolResults) &&
                !isToolCallUnapproved(call, toolResults),
        );
    const hasDashboard = succeeded((n) => n === 'generateDashboard');
    const hasCreateContent = succeeded((n) => n === 'createContent');
    const hasQuery = succeeded(
        (n) => isComposerQueryToolName(n) || QUERY_TOOLS.has(n),
    );
    const hasRunSql = succeeded((n) => n === 'runSql');
    const hasLayerChange = succeeded((n) => LAYER_CHANGE_TOOLS.has(n));
    const onlySearches = toolNames.every((n) => SEARCH_TOOLS.has(n));

    if (hasDashboard) {
        return {
            title: 'How this dashboard was built',
            icon: IconLayoutDashboard,
        };
    }
    if (hasCreateContent) {
        return {
            title: 'How this content was created',
            icon: IconLayoutDashboard,
        };
    }
    // A change to the semantic layer reads the same however it was checked.
    if (hasLayerChange) {
        return { title: 'How this change was made', icon: IconRoute };
    }
    if (hasQuery) {
        return { title: 'How this chart was built', icon: IconChartLine };
    }
    if (hasRunSql) {
        return { title: 'How this was calculated', icon: IconChartLine };
    }
    if (onlySearches) {
        return { title: 'Research steps', icon: IconSearch };
    }
    return { title: 'Steps taken', icon: IconRoute };
};
