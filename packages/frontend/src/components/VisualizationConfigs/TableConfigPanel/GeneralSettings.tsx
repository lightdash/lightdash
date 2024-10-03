import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { Box, Checkbox, Stack, Switch, Tooltip } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { isTableVisualizationConfig } from '../../LightdashVisualization/VisualizationConfigTable';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import { Config } from '../common/Config';
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
        metricQuery: { dimensions },
    } = resultsData || { metricQuery: { dimensions: [] as string[] } };

    const isTableConfig = isTableVisualizationConfig(visualizationConfig);

    const chartConfig = useMemo(() => {
        return isTableConfig ? visualizationConfig.chartConfig : undefined;
    }, [visualizationConfig, isTableConfig]);

    const {
        columns,
        rows,
        metrics,
    }: { columns: string[]; rows: string[]; metrics: string[] } =
        useMemo(() => {
            const columnFields = pivotDimensions ?? [];
            const rowsFields = [...dimensions].filter(
                (itemId) => !pivotDimensions?.includes(itemId),
            );
            const metricsFields = (chartConfig?.selectedItemIds ?? []).filter(
                (id) => ![...columnFields, ...rowsFields].includes(id),
            );
            return {
                columns: columnFields,
                rows: rowsFields,
                metrics: metricsFields,
            };
        }, [pivotDimensions, dimensions, chartConfig]);

    const handleToggleMetricsAsRows = useCallback(() => {
        if (!chartConfig) return;

        const {
            metricsAsRows,
            showRowCalculation,
            showColumnCalculation,
            setShowColumnCalculation,
            setShowRowCalculation,
            setMetricsAsRows,
        } = chartConfig;

        const newValue = !metricsAsRows;

        if (newValue) {
            setShowColumnCalculation(showColumnCalculation);
            setShowRowCalculation(showRowCalculation);
        } else {
            setShowColumnCalculation(showColumnCalculation);
            setShowRowCalculation(showRowCalculation);
        }

        setMetricsAsRows(newValue);
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

    if (!chartConfig) return null;

    const {
        isPivotTableEnabled,
        canUseSubtotals,
        hideRowNumbers,
        metricsAsRows,
        setHideRowNumbers,
        setShowColumnCalculation,
        setShowResultsTotal,
        setShowRowCalculation,
        setShowSubtotals,
        setShowTableNames,
        showColumnCalculation,
        showResultsTotal,
        showRowCalculation,
        showSubtotals,
        showTableNames,
    } = chartConfig;

    return (
        <Stack>
            <DragDropContext
                onDragStart={() => setIsDragging(true)}
                onDragEnd={onDragEnd}
            >
                <Config>
                    <Config.Section>
                        <Config.Heading>Columns</Config.Heading>
                        <DroppableItemsList
                            droppableId={DroppableIds.COLUMNS}
                            itemIds={columns}
                            isDragging={isDragging}
                            disableReorder={false}
                            placeholder={
                                'Drag dimensions into this area to pivot your table'
                            }
                        />

                        <Config.Heading>Rows</Config.Heading>
                        <DroppableItemsList
                            droppableId={DroppableIds.ROWS}
                            itemIds={rows}
                            isDragging={isDragging}
                            disableReorder={true}
                            placeholder={
                                'Drag dimensions into this area to group your data'
                            }
                        />
                    </Config.Section>
                </Config>
            </DragDropContext>

            <Config.Section>
                <Config.Section>
                    <Config.Heading>Metrics</Config.Heading>
                    <Tooltip
                        disabled={!!isPivotTableEnabled && !showSubtotals}
                        label={
                            showSubtotals
                                ? 'Metrics as rows are not available when subtotals are enabled'
                                : 'To use metrics as rows, you need to move a dimension to "Columns"'
                        }
                        w={300}
                        multiline
                        withinPortal
                        position="top-start"
                    >
                        <Box>
                            <Switch
                                disabled={!isPivotTableEnabled || showSubtotals}
                                label="Show metrics as rows"
                                labelPosition="right"
                                checked={metricsAsRows}
                                onChange={() => handleToggleMetricsAsRows()}
                            />
                        </Box>
                    </Tooltip>
                </Config.Section>
            </Config.Section>

            <Config.Section>
                {metrics.map((itemId) => (
                    <ColumnConfiguration key={itemId} fieldId={itemId} />
                ))}
            </Config.Section>

            <Config.Section>
                <Config.Heading>Display</Config.Heading>

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
            </Config.Section>

            <Config.Section>
                <Config.Heading>Results</Config.Heading>
                {isPivotTableEnabled ? (
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
                <Tooltip
                    disabled={canUseSubtotals}
                    label={
                        metricsAsRows
                            ? 'Subtotals cannot be used with metrics as rows'
                            : `Subtotals can only be used on tables with at least two ${
                                  isPivotTableEnabled ? 'un-pivoted' : ''
                              } dimensions`
                    }
                    w={300}
                    multiline
                    withinPortal
                    position="top-start"
                >
                    <Box>
                        <Checkbox
                            label="Show subtotals"
                            checked={
                                canUseSubtotals &&
                                !metricsAsRows &&
                                showSubtotals
                            }
                            onChange={() => {
                                setShowSubtotals(!showSubtotals);
                            }}
                            disabled={!canUseSubtotals || metricsAsRows}
                        />
                    </Box>
                </Tooltip>
            </Config.Section>
        </Stack>
    );
};

export default GeneralSettings;
