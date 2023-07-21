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
        tableConfig: {
            selectedItemIds,
            showTableNames,
            setShowTableNames,
            hideRowNumbers,
            setHideRowNumbers,
            showColumnCalculation,
            setShowColumnCalculation,
            showRowCalculation,
            setShowRowCalculation,
            showResultsTotal,
            setShowResultsTotal,
            metricsAsRows,
            setMetricsAsRows,
            canUsePivotTable,
        },
        setPivotDimensions,
    } = useVisualizationContext();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const { showToastError } = useToaster();
    const {
        metricQuery: { dimensions },
    } = resultsData || { metricQuery: { dimensions: [] as string[] } };

    const {
        columns,
        rows,
        metrics,
    }: { columns: string[]; rows: string[]; metrics: string[] } =
        useMemo(() => {
            const columnFields = pivotDimensions ?? [];
            const rowsFields = dimensions?.filter(
                (itemId) => !pivotDimensions?.includes(itemId),
            );
            const metricsFields = (selectedItemIds ?? []).filter(
                (id) => ![...columnFields, ...rowsFields].includes(id),
            );
            return {
                columns: columnFields,
                rows: rowsFields,
                metrics: metricsFields,
            };
        }, [pivotDimensions, dimensions, selectedItemIds]);

    const handleToggleMetricsAsRows = useCallback(() => {
        const newValue = !metricsAsRows;

        if (newValue) {
            setShowColumnCalculation(showRowCalculation);
            setShowRowCalculation(showColumnCalculation);
        } else {
            setShowColumnCalculation(showRowCalculation);
            setShowRowCalculation(showColumnCalculation);
        }

        setMetricsAsRows(newValue);
    }, [
        metricsAsRows,
        setMetricsAsRows,
        showColumnCalculation,
        setShowColumnCalculation,
        showRowCalculation,
        setShowRowCalculation,
    ]);

    const onDragEnd = useCallback(
        ({ source, destination }: DropResult) => {
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
                        metricsAsRows &&
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
            handleToggleMetricsAsRows,
            metricsAsRows,
            rows,
            setPivotDimensions,
            showToastError,
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
                disabled={!!canUsePivotTable}
                label={
                    'To use metrics as rows, you need to move a dimension to "Columns".'
                }
                position="top"
            >
                <Box my="sm">
                    <Checkbox
                        disabled={!canUsePivotTable}
                        label="Show metrics as rows"
                        checked={metricsAsRows}
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
                    checked={showTableNames}
                    onChange={() => {
                        setShowTableNames(!showTableNames);
                    }}
                />

                <Checkbox
                    label="Show row numbers"
                    checked={!hideRowNumbers}
                    onChange={() => {
                        setHideRowNumbers(!hideRowNumbers);
                    }}
                />
                {canUsePivotTable ? (
                    <Checkbox
                        label="Show row totals"
                        checked={showRowCalculation}
                        onChange={() => {
                            setShowRowCalculation(!showRowCalculation);
                        }}
                    />
                ) : null}
                <Checkbox
                    label="Show column totals"
                    checked={showColumnCalculation}
                    onChange={() => {
                        setShowColumnCalculation(!showColumnCalculation);
                    }}
                />
                <Checkbox
                    label="Show number of results"
                    checked={showResultsTotal}
                    onChange={() => {
                        setShowResultsTotal(!showResultsTotal);
                    }}
                />
            </Stack>
        </Stack>
    );
};

export default GeneralSettings;
