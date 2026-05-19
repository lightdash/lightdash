import {
    isToolName,
    type AiAgentToolName,
    type ToolName,
} from '@lightdash/common';
import {
    IconChartDots3,
    IconChartHistogram,
    IconChartLine,
    IconDatabase,
    IconFileText,
    IconLayoutDashboard,
    IconBook2,
    IconBooks,
    IconPencil,
    IconPlugConnected,
    IconSchool,
    IconSearch,
    IconSelector,
    IconTable,
    IconTerminal2,
    type TablerIconsProps,
} from '@tabler/icons-react';
import type { JSX } from 'react';

export const getToolIcon = (toolName: AiAgentToolName) => {
    const iconMap: Record<ToolName, (props: TablerIconsProps) => JSX.Element> =
        {
            findExplores: IconDatabase,
            findFields: IconSearch,
            discoverFields: IconSearch,
            searchFieldValues: IconSelector,
            generateBarVizConfig: IconChartHistogram,
            generateTimeSeriesVizConfig: IconChartLine,
            generateTableVizConfig: IconTable,
            generateDashboard: IconLayoutDashboard,
            findContent: IconSearch,
            findDashboards: IconLayoutDashboard,
            findCharts: IconChartDots3,
            getDashboardCharts: IconLayoutDashboard,
            readContent: IconBook2,
            editContent: IconPencil,
            improveContext: IconSchool,
            loadSkill: IconBook2,
            proposeChange: IconPencil,
            runQuery: IconTable,
            runSavedChart: IconChartHistogram,
            runSql: IconTerminal2,
            listWarehouseTables: IconDatabase,
            describeWarehouseTable: IconDatabase,
            listKnowledgeDocuments: IconBooks,
            getKnowledgeDocumentContent: IconFileText,
        };

    return isToolName(toolName) ? iconMap[toolName] : IconPlugConnected;
};
