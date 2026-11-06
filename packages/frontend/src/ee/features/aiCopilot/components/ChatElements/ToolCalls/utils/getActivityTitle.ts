import {
    isComposerQueryToolName,
    type AiAgentToolResult,
} from '@lightdash/common';
import {
    IconChartLine,
    IconLayoutDashboard,
    IconRoute,
    IconSearch,
    type TablerIconsProps,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { type LiveActivityToolGroup } from '../LiveActivityCard';
import { getToolCallFailure } from './toolCallFailure';

type ActivityTitle = {
    title: string;
    icon: (props: TablerIconsProps) => JSX.Element;
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
                getToolCallFailure(call, toolResults) === null,
        );
    const hasDashboard = succeeded((n) => n === 'generateDashboard');
    const hasCreateContent = toolNames.includes('createContent');
    const hasQuery = succeeded(
        (n) => isComposerQueryToolName(n) || QUERY_TOOLS.has(n),
    );
    const hasRunSql = succeeded((n) => n === 'runSql');
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
