import {
    ChartType,
    type CreateSavedChartVersion,
    type FilterGroup,
    type FilterGroupInput,
    type FilterGroupItem,
    type FilterGroupItemInput,
    type SemanticChartAsCode,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { ExplorerSection } from '../../providers/Explorer/types';
import { buildInitialExplorerState } from '../explorer/store';

const normalizeFilterItem = (item: FilterGroupItemInput): FilterGroupItem => {
    if ('and' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            and: item.and.map(normalizeFilterItem),
        };
    }
    if ('or' in item) {
        return {
            ...item,
            id: item.id ?? uuidv4(),
            or: item.or.map(normalizeFilterItem),
        };
    }
    return { ...item, id: item.id ?? uuidv4() };
};

const normalizeFilterGroup = (
    group: FilterGroupInput | undefined,
): FilterGroup | undefined => {
    if (!group) {
        return undefined;
    }
    if ('and' in group) {
        return {
            ...group,
            id: group.id ?? uuidv4(),
            and: group.and.map(normalizeFilterItem),
        };
    }
    return {
        ...group,
        id: group.id ?? uuidv4(),
        or: group.or.map(normalizeFilterItem),
    };
};

export const getDocumentChartVersion = (
    chart: SemanticChartAsCode,
): CreateSavedChartVersion => {
    if (chart.chartConfig.type === ChartType.DATA_APP_VIZ) {
        throw new Error('Custom chart types are not supported in Documents.');
    }
    return {
        tableName: chart.tableName,
        metricQuery: {
            ...chart.metricQuery,
            filters: {
                dimensions: normalizeFilterGroup(
                    chart.metricQuery.filters.dimensions,
                ),
                metrics: normalizeFilterGroup(
                    chart.metricQuery.filters.metrics,
                ),
                tableCalculations: normalizeFilterGroup(
                    chart.metricQuery.filters.tableCalculations,
                ),
            },
        },
        chartConfig: chart.chartConfig,
        tableConfig: chart.tableConfig ?? { columnOrder: [] },
        pivotConfig: chart.pivotConfig,
        parameters: chart.parameters,
    };
};

export const buildDocumentChartEditorState = (
    chart: SemanticChartAsCode | null,
    tableName: string,
) => {
    const state = buildInitialExplorerState({ isEditMode: true });
    return buildInitialExplorerState({
        isEditMode: true,
        initialState: {
            queryExecution: {
                ...state.queryExecution,
                pendingFetch: chart !== null,
            },
            expandedSections: [
                ExplorerSection.FILTERS,
                ExplorerSection.VISUALIZATION,
                ExplorerSection.RESULTS,
            ],
            unsavedChartVersion: chart
                ? getDocumentChartVersion(chart)
                : {
                      ...state.unsavedChartVersion,
                      tableName,
                      metricQuery: {
                          ...state.unsavedChartVersion.metricQuery,
                          exploreName: tableName,
                      },
                  },
            parameterReferences: Object.keys(chart?.parameters ?? {}),
        },
    });
};

export const getDocumentChartFromVersion = (
    version: CreateSavedChartVersion,
    name: string,
    description: string,
): SemanticChartAsCode | null => {
    if (version.chartConfig.type === ChartType.DATA_APP_VIZ) {
        return null;
    }
    return {
        name,
        description,
        tableName: version.tableName,
        metricQuery: version.metricQuery,
        chartConfig: version.chartConfig,
        tableConfig: version.tableConfig,
        pivotConfig: version.pivotConfig,
        parameters: version.parameters,
    };
};
