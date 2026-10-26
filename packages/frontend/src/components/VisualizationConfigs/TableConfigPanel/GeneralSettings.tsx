import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import {
    isPivotRowValue,
    isTableColumnVisible,
} from '@lightdash/visualization/editor';
import { Box, Checkbox, Stack, Switch, Tooltip } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import {
    selectTableColumnProperties,
    selectTableEditor,
    selectTableIsPivotTableEnabled,
    selectTableMetricsAsRows,
    selectTableRowFieldIds,
    selectTableSelectedItemIds,
    selectTableShowSubtotals,
    selectTableShowTableNames,
    useVisualizationSelector,
} from '../../../features/visualization/store';
import {
    useTableCanUseSubtotals,
    useTableEditorActions,
} from '../../../hooks/tableVisualization/useTableConfig';
import useToaster from '../../../hooks/toaster/useToaster';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
    useVisualizationServices,
} from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { RowLimitControls } from '../common/RowLimitControls';
import { MAX_PIVOTS } from './constants';
import DroppableItemsList from './DroppableItemsList';

enum DroppableIds {
    COLUMNS = 'COLUMNS',
    ROWS = 'ROWS',
    METRICS = 'METRICS',
}

const usePivotLayout = () => {
    const { pivotDimensions, columnOrder } = useVisualizationInputs();
    const rowFieldIds = useVisualizationInputSelector(selectTableRowFieldIds);
    const selectedItemIds = useVisualizationInputSelector(
        selectTableSelectedItemIds,
    );
    return useMemo(() => {
        const columnFields = pivotDimensions ?? [];
        const metricsFields = (selectedItemIds ?? [])
            .filter((id) => ![...columnFields, ...rowFieldIds].includes(id))
            .sort((a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b));
        return {
            columns: columnFields,
            rows: rowFieldIds,
            metrics: metricsFields,
        };
    }, [pivotDimensions, rowFieldIds, selectedItemIds, columnOrder]);
};

const PivotLayout: FC = () => {
    const { setPivotDimensions, setPivotRows } = useVisualizationServices();
    const { resultsData } = useVisualizationInputs();
    const isPivotTableEnabled = useVisualizationInputSelector(
        selectTableIsPivotTableEnabled,
    );
    const metricsAsRows = useVisualizationInputSelector(
        selectTableMetricsAsRows,
    );
    const { setMetricsAsRows } = useTableEditorActions();
    const { columns, rows, metrics } = usePivotLayout();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const { showToastError } = useToaster();

    const { dimensions } = resultsData?.metricQuery || {
        dimensions: [] as string[],
    };

    const onDragEnd = useCallback(
        ({ source, destination }: DropResult) => {
            setIsDragging(false);
            if (!destination) return;

            const sourceItems =
                source.droppableId === DroppableIds.COLUMNS
                    ? columns
                    : source.droppableId === DroppableIds.ROWS
                      ? rows
                      : metrics;
            const fieldId = sourceItems[source.index];
            const field = resultsData?.fields?.[fieldId];
            const isValueField = isPivotRowValue(field);

            if (source.droppableId !== destination.droppableId) {
                if (
                    destination.droppableId === DroppableIds.COLUMNS &&
                    source.droppableId === DroppableIds.ROWS &&
                    dimensions.includes(fieldId)
                ) {
                    if (columns.length >= MAX_PIVOTS) {
                        showToastError({
                            title: 'Maximum number of pivots reached',
                        });
                        return;
                    }
                    // Add pivot
                    setPivotDimensions([
                        ...columns.slice(0, destination.index),
                        fieldId,
                        ...columns.slice(destination.index),
                    ]);
                    setPivotRows(rows.filter((key) => key !== fieldId));
                } else if (
                    destination.droppableId === DroppableIds.ROWS &&
                    source.droppableId === DroppableIds.COLUMNS
                ) {
                    const newPivotDimensions = columns.filter(
                        (key) => key !== fieldId,
                    );

                    if (metricsAsRows && newPivotDimensions.length === 0) {
                        setMetricsAsRows(false);
                    }
                    setPivotDimensions(newPivotDimensions);
                    const newRowFields = [
                        ...rows.slice(0, destination.index),
                        fieldId,
                        ...rows.slice(destination.index),
                    ];
                    setPivotRows(
                        newPivotDimensions.length > 0
                            ? newRowFields
                            : newRowFields.filter((rowFieldId) =>
                                  dimensions.includes(rowFieldId),
                              ),
                    );
                } else if (
                    destination.droppableId === DroppableIds.ROWS &&
                    source.droppableId === DroppableIds.METRICS &&
                    isValueField
                ) {
                    setPivotRows([
                        ...rows.slice(0, destination.index),
                        fieldId,
                        ...rows.slice(destination.index),
                    ]);
                } else if (
                    destination.droppableId === DroppableIds.METRICS &&
                    source.droppableId === DroppableIds.ROWS &&
                    isValueField
                ) {
                    setPivotRows(rows.filter((key) => key !== fieldId));
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
            } else if (destination.droppableId === DroppableIds.ROWS) {
                const rowsWithoutReorderField = rows.filter(
                    (key) => key !== fieldId,
                );
                setPivotRows([
                    ...rowsWithoutReorderField.slice(0, destination.index),
                    fieldId,
                    ...rowsWithoutReorderField.slice(destination.index),
                ]);
            }
        },
        [
            columns,
            rows,
            metrics,
            setPivotRows,
            metricsAsRows,
            setMetricsAsRows,
            setPivotDimensions,
            showToastError,
            dimensions,
            resultsData?.fields,
        ],
    );

    return (
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
                        disableReorder={false}
                        placeholder={
                            'Drag dimensions, metrics, or table calculations into this area'
                        }
                    />

                    <Config.Heading>Metrics</Config.Heading>
                    <DroppableItemsList
                        droppableId={DroppableIds.METRICS}
                        itemIds={metrics}
                        placeholder={
                            'Drag metrics or table calculations into this area'
                        }
                        draggableItemIds={
                            isPivotTableEnabled
                                ? metrics.filter((itemId) => {
                                      const item =
                                          resultsData?.fields?.[itemId];
                                      return isPivotRowValue(item);
                                  })
                                : []
                        }
                        isDragging={isDragging}
                        disableReorder={true}
                        getColumnConfigurationProps={() => ({
                            syncFreezeWith: metricsAsRows ? metrics : undefined,
                            hideFreezeToggle:
                                !!isPivotTableEnabled && !metricsAsRows,
                        })}
                    />
                </Config.Section>
            </Config>
        </DragDropContext>
    );
};

const GeneralSettings: FC = () => {
    const { resultsData } = useVisualizationInputs();
    const isPivotTableEnabled = useVisualizationInputSelector(
        selectTableIsPivotTableEnabled,
    );
    const metricsAsRows = useVisualizationInputSelector(
        selectTableMetricsAsRows,
    );
    const columnProperties = useVisualizationInputSelector(
        selectTableColumnProperties,
    );
    const showTableNames = useVisualizationInputSelector(
        selectTableShowTableNames,
    );
    const showSubtotals = useVisualizationInputSelector(
        selectTableShowSubtotals,
    );
    const hideRowNumbers = useVisualizationSelector(
        (state) => selectTableEditor(state).hideRowNumbers,
    );
    const showColumnCalculation = useVisualizationSelector(
        (state) => selectTableEditor(state).showColumnCalculation,
    );
    const showRowCalculation = useVisualizationSelector(
        (state) => selectTableEditor(state).showRowCalculation,
    );
    const showResultsTotal = useVisualizationSelector(
        (state) => selectTableEditor(state).showResultsTotal,
    );
    const showSubtotalsExpanded = useVisualizationSelector(
        (state) => selectTableEditor(state).showSubtotalsExpanded,
    );
    const showRowGrouping = useVisualizationSelector(
        (state) => selectTableEditor(state).showRowGrouping,
    );
    const rowLimit = useVisualizationSelector(
        (state) => selectTableEditor(state).rowLimit,
    );
    const canUseSubtotals = useTableCanUseSubtotals();
    const { toggle, toggleShowTableNames, setMetricsAsRows, setRowLimit } =
        useTableEditorActions();
    const { metrics } = usePivotLayout();

    const canUseMetricsAsRows =
        !!isPivotTableEnabled &&
        metrics.some(
            (fieldId) =>
                isTableColumnVisible(columnProperties, fieldId) &&
                isPivotRowValue(resultsData?.fields?.[fieldId]),
        );

    return (
        <Stack>
            <PivotLayout />

            <Config.Section>
                <Config.Section>
                    <Config.Heading>Metric layout</Config.Heading>
                    <Tooltip
                        disabled={canUseMetricsAsRows}
                        label={
                            isPivotTableEnabled
                                ? 'Move a metric or table calculation back to Metrics to use this layout'
                                : 'To use metrics as rows, you need to move a dimension to "Columns"'
                        }
                        w={300}
                        position="top-start"
                    >
                        <Box>
                            <Switch
                                size="xs"
                                disabled={!canUseMetricsAsRows}
                                label="Show metrics as rows"
                                labelPosition="right"
                                checked={metricsAsRows}
                                onChange={() =>
                                    setMetricsAsRows(!metricsAsRows)
                                }
                            />
                        </Box>
                    </Tooltip>
                </Config.Section>
            </Config.Section>

            <Config.Section>
                <Config.Heading>Display</Config.Heading>

                <Checkbox
                    size="xs"
                    label="Show table names"
                    checked={showTableNames}
                    onChange={() => {
                        toggleShowTableNames();
                    }}
                />
                <Checkbox
                    size="xs"
                    label="Show row numbers"
                    checked={!hideRowNumbers}
                    onChange={() => {
                        toggle('hideRowNumbers');
                    }}
                />
            </Config.Section>

            {!isPivotTableEnabled && (
                <Config.Section>
                    <Config.Heading>Data</Config.Heading>
                    <RowLimitControls
                        rowLimit={rowLimit}
                        onRowLimitChange={setRowLimit}
                    />
                </Config.Section>
            )}

            <Config.Section>
                <Config.Heading>Results</Config.Heading>
                {isPivotTableEnabled ? (
                    <Checkbox
                        size="xs"
                        label="Show row totals"
                        checked={showRowCalculation}
                        onChange={() => {
                            toggle('showRowCalculation');
                        }}
                    />
                ) : null}
                <Checkbox
                    size="xs"
                    label="Show column totals"
                    checked={showColumnCalculation}
                    onChange={() => {
                        toggle('showColumnCalculation');
                    }}
                />
                <Checkbox
                    size="xs"
                    label="Show number of results"
                    checked={showResultsTotal}
                    onChange={() => {
                        toggle('showResultsTotal');
                    }}
                />
                <Tooltip
                    disabled={canUseSubtotals}
                    label={`Subtotals can only be used on tables with at least two ${
                        isPivotTableEnabled ? 'un-pivoted' : ''
                    } dimensions`}
                    w={300}
                    position="top-start"
                >
                    <Box>
                        <Checkbox
                            size="xs"
                            label="Show subtotals"
                            checked={canUseSubtotals && showSubtotals}
                            onChange={() => {
                                toggle('showSubtotals');
                            }}
                            disabled={!canUseSubtotals}
                        />
                    </Box>
                </Tooltip>
                <Checkbox
                    size="xs"
                    ml="lg"
                    label="Expand subtotals by default"
                    checked={showSubtotalsExpanded ?? false}
                    onChange={() => {
                        toggle('showSubtotalsExpanded');
                    }}
                    disabled={!canUseSubtotals || !showSubtotals}
                />
                <Tooltip
                    disabled={
                        canUseSubtotals && !showSubtotals && !metricsAsRows
                    }
                    label={
                        showSubtotals
                            ? 'Row grouping is always on when subtotals are enabled.'
                            : metricsAsRows
                              ? 'Row grouping cannot be used with metrics as rows'
                              : `Row grouping can only be used on tables with at least two ${
                                    isPivotTableEnabled ? 'un-pivoted' : ''
                                } dimensions`
                    }
                    w={300}
                    position="top-start"
                >
                    <Box>
                        <Checkbox
                            size="xs"
                            label="Group repeated row values"
                            checked={
                                showSubtotals ||
                                (canUseSubtotals &&
                                    !metricsAsRows &&
                                    (showRowGrouping ?? false))
                            }
                            onChange={() => {
                                toggle('showRowGrouping');
                            }}
                            disabled={
                                !canUseSubtotals ||
                                metricsAsRows ||
                                showSubtotals
                            }
                        />
                    </Box>
                </Tooltip>
            </Config.Section>
        </Stack>
    );
};

export default GeneralSettings;
