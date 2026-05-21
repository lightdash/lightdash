import {
    IconChartLine,
    IconLayoutDashboard,
    IconSearch,
    IconSparkles,
    type TablerIconsProps,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import { type LiveActivityToolGroup } from '../LiveActivityCard';

type ActivityTitle = {
    title: string;
    icon: (props: TablerIconsProps) => JSX.Element;
};

const SEARCH_TOOLS = new Set([
    'findExplores',
    'findFields',
    'discoverFields',
    'searchFieldValues',
    'findContent',
    'findDashboards',
    'findCharts',
    'getDashboardCharts',
    'listWarehouseTables',
    'describeWarehouseTable',
]);

const VIZ_TOOLS = new Set([
    'generateBarVizConfig',
    'generateTimeSeriesVizConfig',
    'generateTableVizConfig',
]);

/**
 * Summarizes a finished agent run into one opinionated title shown in the
 * activity bento. The title morphs based on what tools the agent actually
 * used.
 */
export const getActivityTitle = (
    toolGroups: LiveActivityToolGroup[],
): ActivityTitle => {
    if (toolGroups.length === 0) {
        return { title: 'Steps taken', icon: IconSparkles };
    }
    const toolNames = toolGroups.map((g) => g.toolName);
    const hasDashboard = toolNames.includes('generateDashboard');
    const hasViz = toolNames.some((n) => VIZ_TOOLS.has(n));
    const hasQuery = toolNames.includes('runQuery');
    const hasRunSql = toolNames.includes('runSql');
    const onlySearches = toolNames.every((n) => SEARCH_TOOLS.has(n));

    if (hasDashboard) {
        return {
            title: 'How this dashboard was built',
            icon: IconLayoutDashboard,
        };
    }
    if (hasViz || hasQuery) {
        return { title: 'How this chart was built', icon: IconChartLine };
    }
    if (hasRunSql) {
        return { title: 'How this was calculated', icon: IconChartLine };
    }
    if (onlySearches) {
        return { title: 'Research steps', icon: IconSearch };
    }
    return { title: 'Steps taken', icon: IconSparkles };
};
