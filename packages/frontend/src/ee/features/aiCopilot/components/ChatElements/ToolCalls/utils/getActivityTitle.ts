import {
    IconChartLine,
    IconLayoutDashboard,
    IconRoute,
    IconSearch,
    type TablerIconsProps,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import i18n from '../../../../../../../i18n/i18n';
import { type LiveActivityToolGroup } from '../LiveActivityCard';

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

/**
 * Summarizes a finished agent run into one opinionated title shown in the
 * activity bento. The title morphs based on what tools the agent actually
 * used.
 */
const title = (key: string) =>
    i18n.t(`activityTitle.${key}`, { ns: 'aiCopilotChat' });

export const getActivityTitle = (
    toolGroups: LiveActivityToolGroup[],
): ActivityTitle => {
    if (toolGroups.length === 0) {
        return { title: title('stepsTaken'), icon: IconRoute };
    }
    const toolNames = toolGroups.flatMap((g) =>
        g.calls.map((call) => call.toolName),
    );
    const hasDashboard = toolNames.includes('generateDashboard');
    const hasCreateContent = toolNames.includes('createContent');
    const hasQuery =
        toolNames.includes('generateVisualization') ||
        toolNames.includes('runContentQuery') ||
        toolNames.includes('runQuery');
    const hasRunSql = toolNames.includes('runSql');
    const onlySearches = toolNames.every((n) => SEARCH_TOOLS.has(n));

    if (hasDashboard) {
        return {
            title: title('dashboardBuilt'),
            icon: IconLayoutDashboard,
        };
    }
    if (hasCreateContent) {
        return {
            title: title('contentCreated'),
            icon: IconLayoutDashboard,
        };
    }
    if (hasQuery) {
        return { title: title('chartBuilt'), icon: IconChartLine };
    }
    if (hasRunSql) {
        return { title: title('calculated'), icon: IconChartLine };
    }
    if (onlySearches) {
        return { title: title('researchSteps'), icon: IconSearch };
    }
    return { title: title('stepsTaken'), icon: IconRoute };
};
