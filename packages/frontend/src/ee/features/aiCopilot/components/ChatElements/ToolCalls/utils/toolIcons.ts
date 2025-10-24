import type { ToolName } from '@lightdash/common';
import {
    IconChartDots3,
    IconChartHistogram,
    IconChartLine,
    IconDatabase,
    IconLayoutDashboard,
    IconPencil,
    IconSchool,
    IconSearch,
    IconSelector,
    IconTable,
    type TablerIconsProps,
} from '@tabler/icons-react';
import type { JSX } from 'react';

export const getToolIcon = (toolName: ToolName) => {
    const iconMap: Record<ToolName, (props: TablerIconsProps) => JSX.Element> =
        {
            findExplores: IconDatabase,
            findFields: IconSearch,
            searchFieldValues: IconSelector,
            generateBarVizConfig: IconChartHistogram,
            generateTimeSeriesVizConfig: IconChartLine,
            generateTableVizConfig: IconTable,
            generateDashboard: IconLayoutDashboard,
            findContent: IconSearch,
            findDashboards: IconLayoutDashboard,
            findCharts: IconChartDots3,
            improveContext: IconSchool,
            proposeChange: IconPencil,
            runQuery: IconTable,
        };

    return iconMap[toolName];
};
