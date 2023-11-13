import { ChartType, getCustomDimensionId } from '@lightdash/common';
import { Box, Checkbox, Stack, Title, Tooltip } from '@mantine/core';
import React, { FC, useCallback, useMemo, useState } from 'react';
import { DragDropContext, DropResult } from 'react-beautiful-dnd';
import useToaster from '../../../hooks/toaster/useToaster';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import ColumnConfiguration from './ColumnConfiguration';
import DroppableItemsList from './DroppableItemsList';

export const MAX_PIVOTS = 3;

enum DroppableIds {
    COLUMNS = 'COLUMNS',
    ROWS = 'ROWS',
}

const GeneralSettings: FC = () => {
    const {
        resultsData,
        pivotDimensions,
        visualizationConfig,
        setPivotDimensions,
    } = useVisualizationContext();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const { showToastError } = useToaster();
    const {
        metricQuery: { dimensions, customDimensions },
    } = resultsData || { metricQuery: { dimensions: [] as string[] } };

    const chartConfig = useMemo(() => {
        return visualizationConfig?.chartType === ChartType.TABLE
            ? visualizationConfig.chartConfig
            : undefined;
    }, [visualizationConfig]);

    const {
        columns,
        rows,
        metrics,
    }: { columns: string[]; rows: string[]; metrics: string[] } =
        useMemo(() => {
            const columnFields = pivotDimensions ?? [];
            const rowsFields = [
                ...dimensions,
                ...(customDimensions?.map(getCustomDimensionId) || []),
            ].filter((itemId) => !pivotDimensions?.includes(itemId));
            const metricsFields = (chartConfig?.selectedItemIds ?? []).filter(
                (id) => ![...columnFields, ...rowsFields].includes(id),
            );
            return {
                columns: columnFields,
                rows: rowsFields,
                metrics: metricsFields,
            };
        }, [pivotDimensions, dimensions, chartConfig, customDimensions]);

    const handleToggleMetricsAsRows = useCallback(() => {
        if (!chartConfig) return;

        const newValue = !chartConfig.metricsAsRows;

        if (newValue) {
            chartConfig.setShowColumnCalculation(
                chartConfig.showRowCalculation,
            );
            chartConfig.setShowRowCalculation(
                chartConfig.showColumnCalculation,
            );
        } else {
            chartConfig.setShowColumnCalculation(
                chartConfig.showRowCalculation,
            );
            chartConfig.setShowRowCalculation(
                chartConfig.showColumnCalculation,
            );
        }

        chartConfig.setMetricsAsRows(newValue);
    }, [chartConfig]);

    const onDragEnd = useCallback(
        ({ source, destination }: DropResult) => {
            if (!chartConfig) return;

            setIsDragging(false);
            if (!destination) return;

            if (source.droppableId !== destination.droppableId) {
                if (destination.droppableId === DroppableIds.COLUMNS) {
                    if (columns.length >= MAX_PIVOTS) {
                        showToastError({
                            title: 'Maximum number of pivots reached',
                        });
                        return;
                    }
                    // Add pivot
                    const fieldId = rows[source.index];
                    setPivotDimensions([
                        ...columns.slice(0, destination.index),
                        fieldId,
                        ...columns.slice(destination.index),
                    ]);
                } else {
                    // Remove pivot
                    const fieldId = columns[source.index];
                    const newPivotDimensions = columns.filter(
                        (key) => key !== fieldId,
                    );

                    if (
                        chartConfig.metricsAsRows &&
                        (!newPivotDimensions || newPivotDimensions.length === 0)
                    ) {
                        handleToggleMetricsAsRows();
                    }
                    setPivotDimensions(newPivotDimensions);
                }
            } else if (destination.droppableId === DroppableIds.COLUMNS) {
                // Reorder pivot
                const fieldId = columns[source.index];
                const columnsWithoutReorderField = columns.filter(
                    (key) => key !== fieldId,
                );
                setPivotDimensions([
                    ...columnsWithoutReorderField.slice(0, destination.index),
                    fieldId,
                    ...columnsWithoutReorderField.slice(destination.index),
                ]);
            }
        },
        [
            columns,
            rows,
            chartConfig,
            setPivotDimensions,
            showToastError,
            handleToggleMetricsAsRows,
        ],
    );

    return (
        <Stack spacing={0}>
            <DragDropContext
                onDragStart={() => setIsDragging(true)}
                onDragEnd={onDragEnd}
            >
                <Title order={6}>Columns</Title>
                <DroppableItemsList
                    droppableId={DroppableIds.COLUMNS}
                    itemIds={columns}
                    isDragging={isDragging}
                    disableReorder={false}
                    placeholder={
                        'Move dimensions to columns to pivot your table'
                    }
                />
                <Title order={6}>Rows</Title>
                <DroppableItemsList
                    droppableId={DroppableIds.ROWS}
                    itemIds={rows}
                    isDragging={isDragging}
                    disableReorder={true}
                />
            </DragDropContext>

            <Title order={6}>Metrics</Title>
            <Tooltip
                disabled={!!chartConfig?.canUsePivotTable}
                label={
                    'To use metrics as rows, you need to move a dimension to "Columns"'
                }
                w={300}
                multiline
                withinPortal
                position="top-start"
            >
                <Box my="sm">
                    <Checkbox
                        disabled={!chartConfig?.canUsePivotTable}
                        label="Show metrics as rows"
                        checked={chartConfig?.metricsAsRows}
                        onChange={() => handleToggleMetricsAsRows()}
                    />
                </Box>
            </Tooltip>
            <Stack spacing="xs" mb="md">
                {metrics.map((itemId) => (
                    <ColumnConfiguration key={itemId} fieldId={itemId} />
                ))}
            </Stack>

            <Title order={6}>Options</Title>
            <Stack mt="sm" spacing="xs">
                <Checkbox
                    label="Show table names"
                    checked={chartConfig?.showTableNames}
                    onChange={() => {
                        chartConfig?.setShowTableNames(
                            !chartConfig?.showTableNames,
                        );
                    }}
                />

                <Checkbox
                    label="Show row numbers"
                    checked={!chartConfig?.hideRowNumbers}
                    onChange={() => {
                        chartConfig?.setHideRowNumbers(
                            !chartConfig?.hideRowNumbers,
                        );
                    }}
                />
                {chartConfig?.canUsePivotTable ? (
                    <Checkbox
                        label="Show row totals"
                        checked={chartConfig?.showRowCalculation}
                        onChange={() => {
                            chartConfig?.setShowRowCalculation(
                                !chartConfig?.showRowCalculation,
                            );
                        }}
                    />
                ) : null}
                <Checkbox
                    label="Show column totals"
                    checked={chartConfig?.showColumnCalculation}
                    onChange={() => {
                        chartConfig?.setShowColumnCalculation(
                            !chartConfig?.showColumnCalculation,
                        );
                    }}
                />
                <Checkbox
                    label="Show number of results"
                    checked={chartConfig?.showResultsTotal}
                    onChange={() => {
                        chartConfig?.setShowResultsTotal(
                            !chartConfig?.showResultsTotal,
                        );
                    }}
                />
            </Stack>
        </Stack>
    );
};

export default GeneralSettings;
