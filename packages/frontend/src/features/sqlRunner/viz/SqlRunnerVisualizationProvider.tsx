import {
    ECHARTS_DEFAULT_COLORS,
    rekeyPivotDetails,
    rekeyResultRows,
    type ChartConfig,
    type ChartType,
} from '@lightdash/common';
import { useMantineColorScheme } from '@mantine/core';
import { useCallback, useMemo, type FC, type PropsWithChildren } from 'react';
import VisualizationProvider from '../../../components/LightdashVisualization/VisualizationProvider';
import { useProjectColorPalette } from '../../../hooks/appearance/useProjectColorPalette';
import { useInfiniteQueryResults } from '../../../hooks/useQueryResults';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
    EditorTabs,
    selectActiveEditorTab,
    selectChartConfig,
    selectConnectionUuid,
    selectLimit,
    selectParameterValues,
    selectPivotDimensions,
    selectProjectUuid,
    selectQueryUuid,
    selectSavedChart,
    selectSql,
    setChartConfig,
    setChartType,
    setPivotDimensions,
} from '../store/sqlRunnerSlice';
import { useSqlRunnerPivotConfiguration } from './useSqlRunnerPivotConfiguration';
import { useSqlRunnerPivotQuery } from './useSqlRunnerPivotQuery';

/**
 * The classic chart stack over the SQL runner's last run: the result's
 * columns become the chart's fields (keyed `sql_<column>`, as a saved SQL
 * chart's are), the store's chart config is the explorer config the chart
 * draws with, and a grouped chart re-pivots the statement on the warehouse.
 * Wraps the page so the sidebar's config panel and the chart share one
 * context; the rows are read only while the Chart tab is open.
 */
export const SqlRunnerVisualizationProvider: FC<PropsWithChildren> = ({
    children,
}) => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector(selectProjectUuid);
    const sql = useAppSelector(selectSql);
    const limit = useAppSelector(selectLimit);
    const parameterValues = useAppSelector(selectParameterValues);
    const warehouseConnectionUuid = useAppSelector(selectConnectionUuid);
    const queryUuid = useAppSelector(selectQueryUuid);
    const chartConfig = useAppSelector(selectChartConfig);
    const pivotDimensions = useAppSelector(selectPivotDimensions);
    const savedChart = useAppSelector(selectSavedChart);
    const activeEditorTab = useAppSelector(selectActiveEditorTab);
    const isChartOpen = activeEditorTab === EditorTabs.VISUALIZATION;

    const { colorScheme } = useMantineColorScheme();
    const { data: palette } = useProjectColorPalette(projectUuid, {});
    const colorPalette = useMemo(() => {
        if (savedChart?.colorPalette) return savedChart.colorPalette;
        if (colorScheme === 'dark' && palette?.darkColors)
            return palette.darkColors;
        return palette?.colors ?? ECHARTS_DEFAULT_COLORS;
    }, [savedChart?.colorPalette, colorScheme, palette]);

    const { items, pivotConfiguration } = useSqlRunnerPivotConfiguration();
    const pivot = useSqlRunnerPivotQuery({
        projectUuid,
        sql,
        limit,
        parameterValues,
        warehouseConnectionUuid,
        sourceQueryUuid: isChartOpen ? queryUuid : undefined,
        pivotConfiguration,
    });
    const displayedQueryUuid = pivotConfiguration
        ? pivot.data?.queryUuid
        : queryUuid;
    const results = useInfiniteQueryResults(
        projectUuid,
        isChartOpen ? displayedQueryUuid : undefined,
    );

    const resultsData = useMemo(() => {
        if (!items) {
            return {
                ...results,
                rows: [],
                metricQuery: undefined,
                fields: undefined,
            };
        }
        return {
            ...results,
            rows: rekeyResultRows(results.rows, items.fieldIdByColumn),
            pivotDetails: results.pivotDetails
                ? rekeyPivotDetails(results.pivotDetails, items.fieldIdByColumn)
                : results.pivotDetails,
            metricQuery: items.metricQuery,
            fields: items.itemsMap,
        };
    }, [results, items]);

    const columnOrder = useMemo(() => {
        if (!items) return [];
        const fieldIds = [
            ...items.metricQuery.dimensions,
            ...items.metricQuery.metrics,
        ];
        const known = new Set(fieldIds);
        const saved = (savedChart?.tableConfig.columnOrder ?? []).filter(
            (fieldId) => known.has(fieldId),
        );
        return [...saved, ...fieldIds.filter((id) => !saved.includes(id))];
    }, [items, savedChart?.tableConfig.columnOrder]);

    const handleChartConfigChange = useCallback(
        (next: ChartConfig) => dispatch(setChartConfig(next)),
        [dispatch],
    );
    const handleChartTypeChange = useCallback(
        (type: ChartType) => dispatch(setChartType(type)),
        [dispatch],
    );
    const handlePivotDimensionsChange = useCallback(
        (next: string[] | undefined) => dispatch(setPivotDimensions(next)),
        [dispatch],
    );

    const isLoading =
        isChartOpen &&
        (results.isFetchingRows ||
            (pivotConfiguration !== null && (pivot.isFetching || !pivot.data)));

    return (
        <VisualizationProvider
            hasExplorerStore={false}
            chartConfig={chartConfig}
            initialPivotDimensions={pivotDimensions}
            resultsData={resultsData}
            isLoading={isLoading}
            columnOrder={columnOrder}
            colorPalette={colorPalette}
            apiErrorDetail={pivot.error?.error ?? results.error?.error ?? null}
            onChartConfigChange={handleChartConfigChange}
            onChartTypeChange={handleChartTypeChange}
            onPivotDimensionsChange={handlePivotDimensionsChange}
            unsavedMetricQuery={items?.metricQuery}
        >
            {children}
        </VisualizationProvider>
    );
};
