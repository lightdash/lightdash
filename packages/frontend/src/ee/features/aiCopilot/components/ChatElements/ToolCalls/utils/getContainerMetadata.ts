import type { TablerIconsProps } from '@tabler/icons-react';
import {
    IconAnalyze,
    IconChartLine,
    IconLayoutDashboard,
    IconSearch,
    IconSparkles,
} from '@tabler/icons-react';
import type { JSX } from 'react';
import type { ToolCallDisplayType, ToolCallSummary } from './types';

type ContainerMetadata = {
    title: string;
    icon: (props: TablerIconsProps) => JSX.Element;
};

/**
 * Determines the container title and icon based on the tool calls.
 * This categorizes the tool calls once and returns both title and icon together.
 */
export const getContainerMetadata = (
    toolCalls: ToolCallSummary[] | undefined,
    type: ToolCallDisplayType,
): ContainerMetadata => {
    if (type === 'streaming') {
        return {
            title: 'Working on it...',
            icon: IconAnalyze,
        };
    }

    // Empty state
    if (!toolCalls || toolCalls.length === 0) {
        return {
            title: 'Steps taken',
            icon: IconSparkles,
        };
    }

    const hasDashboardGeneration = toolCalls.some((tc) =>
        ['generateDashboard'].includes(tc.toolName),
    );

    const hasVizGeneration = toolCalls.some((tc) =>
        [
            'generateBarVizConfig',
            'generateTimeSeriesVizConfig',
            'generateTableVizConfig',
        ].includes(tc.toolName),
    );

    const hasQueryExecution = toolCalls.some(
        (tc) => tc.toolName === 'runQuery',
    );

    const hasOnlySearches = toolCalls.every((tc) =>
        [
            'findExplores',
            'findFields',
            'searchFieldValues',
            'findContent',
            'findDashboards',
            'findCharts',
        ].includes(tc.toolName),
    );

    if (hasDashboardGeneration) {
        return {
            title: 'How this dashboard was built',
            icon: IconLayoutDashboard,
        };
    }

    if (hasVizGeneration || hasQueryExecution) {
        return {
            title: 'How this chart was built',
            icon: IconChartLine,
        };
    }

    if (hasOnlySearches) {
        return {
            title: 'Research steps',
            icon: IconSearch,
        };
    }

    return {
        title: toolCalls.length === 1 ? 'Step taken' : 'Steps taken',
        icon: IconSparkles,
    };
};
