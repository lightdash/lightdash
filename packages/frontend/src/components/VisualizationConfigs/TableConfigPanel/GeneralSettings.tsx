import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { isPivotRowValue } from '@lightdash/visualization/editor';
import { Box, Checkbox, Stack, Switch, Tooltip } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import useToaster from '../../../hooks/toaster/useToaster';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import { RowLimitControls } from '../common/RowLimitControls';
import { MAX_PIVOTS } from './constants';
import DroppableItemsList from './DroppableItemsList';

enum DroppableIds {
    COLUMNS = 'COLUMNS',
    ROWS = 'ROWS',
    METRICS = 'METRICS',
}

const GeneralSettings: FC = () => {
    const { t } = useTranslation('vizConfig');
    const {
        resultsData,
        pivotDimensions,
        visualizationConfig,
        setPivotDimensions,
        columnOrder,
    } = useVisualizationContext();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const { showToastError } = useToaster();

    const { dimensions } = resultsData?.metricQuery || {
        dimensions: [] as string[],
    };

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
            const rowsFields = chartConfig?.rowFieldIds ?? [];
            const metricsFields = (chartConfig?.selectedItemIds ?? [])
                .filter((id) => ![...columnFields, ...rowsFields].includes(id))
                .sort(
                    (a, b) => columnOrder.indexOf(a) - columnOrder.indexOf(b),
                );
            return {
                columns: columnFields,
                rows: rowsFields,
                metrics: metricsFields,
            };
        }, [pivotDimensions, chartConfig, columnOrder]);

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
                            title: t('table.general.maxPivotsReached'),
                        });
                        return;
                    }
                    // Add pivot
                    setPivotDimensions([
                        ...columns.slice(0, destination.index),
                        fieldId,
                        ...columns.slice(destination.index),
                    ]);
                    chartConfig.setRowFieldIds?.(
                        rows.filter((key) => key !== fieldId),
                    );
                } else if (
                    destination.droppableId === DroppableIds.ROWS &&
                    source.droppableId === DroppableIds.COLUMNS
                ) {
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
                    const newRowFields = [
                        ...rows.slice(0, destination.index),
                        fieldId,
                        ...rows.slice(destination.index),
                    ];
                    chartConfig.setRowFieldIds?.(
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
                    chartConfig.setRowFieldIds?.([
                        ...rows.slice(0, destination.index),
                        fieldId,
                        ...rows.slice(destination.index),
                    ]);
                } else if (
                    destination.droppableId === DroppableIds.METRICS &&
                    source.droppableId === DroppableIds.ROWS &&
                    isValueField
                ) {
                    chartConfig.setRowFieldIds?.(
                        rows.filter((key) => key !== fieldId),
                    );
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
                chartConfig.setRowFieldIds?.([
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
            chartConfig,
            setPivotDimensions,
            showToastError,
            t,
            handleToggleMetricsAsRows,
            dimensions,
            resultsData?.fields,
        ],
    );

    if (!chartConfig) return null;

    const {
        isPivotTableEnabled,
        isColumnVisible,
        canUseSubtotals,
        hideRowNumbers,
        metricsAsRows,
        setHideRowNumbers,
        setShowColumnCalculation,
        setShowResultsTotal,
        setShowRowCalculation,
        setShowSubtotals,
        setShowSubtotalsExpanded,
        setShowRowGrouping,
        setShowTableNames,
        showColumnCalculation,
        showResultsTotal,
        showRowCalculation,
        showSubtotals,
        showSubtotalsExpanded,
        showRowGrouping,
        showTableNames,
        rowLimit,
        setRowLimit,
    } = chartConfig;
    const canUseMetricsAsRows =
        !!isPivotTableEnabled &&
        metrics.some(
            (fieldId) =>
                isColumnVisible(fieldId) &&
                isPivotRowValue(resultsData?.fields?.[fieldId]),
        );

    return (
        <Stack>
            <DragDropContext
                onDragStart={() => setIsDragging(true)}
                onDragEnd={onDragEnd}
            >
                <Config>
                    <Config.Section>
                        <Config.Heading>
                            {t('table.general.columns')}
                        </Config.Heading>
                        <DroppableItemsList
                            droppableId={DroppableIds.COLUMNS}
                            itemIds={columns}
                            isDragging={isDragging}
                            disableReorder={false}
                            placeholder={t('table.general.columnsPlaceholder')}
                        />

                        <Config.Heading>
                            {t('table.general.rows')}
                        </Config.Heading>
                        <DroppableItemsList
                            droppableId={DroppableIds.ROWS}
                            itemIds={rows}
                            isDragging={isDragging}
                            disableReorder={false}
                            placeholder={t('table.general.rowsPlaceholder')}
                        />

                        <Config.Heading>
                            {t('table.general.metrics')}
                        </Config.Heading>
                        <DroppableItemsList
                            droppableId={DroppableIds.METRICS}
                            itemIds={metrics}
                            placeholder={t('table.general.metricsPlaceholder')}
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
                                syncFreezeWith: metricsAsRows
                                    ? metrics
                                    : undefined,
                                hideFreezeToggle:
                                    !!isPivotTableEnabled && !metricsAsRows,
                            })}
                        />
                    </Config.Section>
                </Config>
            </DragDropContext>

            <Config.Section>
                <Config.Section>
                    <Config.Heading>
                        {t('table.general.metricLayout')}
                    </Config.Heading>
                    <Tooltip
                        disabled={canUseMetricsAsRows}
                        label={
                            isPivotTableEnabled
                                ? t('table.general.metricsAsRowsPivotDisabled')
                                : t('table.general.metricsAsRowsNeedColumn')
                        }
                        w={300}
                        position="top-start"
                    >
                        <Box>
                            <Switch
                                size="xs"
                                disabled={!canUseMetricsAsRows}
                                label={t('table.general.showMetricsAsRows')}
                                labelPosition="right"
                                checked={metricsAsRows}
                                onChange={() => handleToggleMetricsAsRows()}
                            />
                        </Box>
                    </Tooltip>
                </Config.Section>
            </Config.Section>

            <Config.Section>
                <Config.Heading>{t('table.general.display')}</Config.Heading>

                <Checkbox
                    size="xs"
                    label={t('table.general.showTableNames')}
                    checked={showTableNames}
                    onChange={() => {
                        setShowTableNames(!showTableNames);
                    }}
                />
                <Checkbox
                    size="xs"
                    label={t('table.general.showRowNumbers')}
                    checked={!hideRowNumbers}
                    onChange={() => {
                        setHideRowNumbers(!hideRowNumbers);
                    }}
                />
            </Config.Section>

            {!isPivotTableEnabled && (
                <Config.Section>
                    <Config.Heading>{t('table.general.data')}</Config.Heading>
                    <RowLimitControls
                        rowLimit={rowLimit}
                        onRowLimitChange={setRowLimit}
                    />
                </Config.Section>
            )}

            <Config.Section>
                <Config.Heading>{t('table.general.results')}</Config.Heading>
                {isPivotTableEnabled ? (
                    <Checkbox
                        size="xs"
                        label={t('table.general.showRowTotals')}
                        checked={showRowCalculation}
                        onChange={() => {
                            setShowRowCalculation(!showRowCalculation);
                        }}
                    />
                ) : null}
                <Checkbox
                    size="xs"
                    label={t('table.general.showColumnTotals')}
                    checked={showColumnCalculation}
                    onChange={() => {
                        setShowColumnCalculation(!showColumnCalculation);
                    }}
                />
                <Checkbox
                    size="xs"
                    label={t('table.general.showNumberOfResults')}
                    checked={showResultsTotal}
                    onChange={() => {
                        setShowResultsTotal(!showResultsTotal);
                    }}
                />
                <Tooltip
                    disabled={canUseSubtotals}
                    label={
                        isPivotTableEnabled
                            ? t(
                                  'table.general.subtotalsRequireUnpivotedDimensions',
                              )
                            : t('table.general.subtotalsRequireDimensions')
                    }
                    w={300}
                    position="top-start"
                >
                    <Box>
                        <Checkbox
                            size="xs"
                            label={t('table.general.showSubtotals')}
                            checked={canUseSubtotals && showSubtotals}
                            onChange={() => {
                                setShowSubtotals(!showSubtotals);
                            }}
                            disabled={!canUseSubtotals}
                        />
                    </Box>
                </Tooltip>
                <Checkbox
                    size="xs"
                    ml="lg"
                    label={t('table.general.expandSubtotals')}
                    checked={showSubtotalsExpanded ?? false}
                    onChange={() => {
                        setShowSubtotalsExpanded(!showSubtotalsExpanded);
                    }}
                    disabled={!canUseSubtotals || !showSubtotals}
                />
                <Tooltip
                    disabled={
                        canUseSubtotals && !showSubtotals && !metricsAsRows
                    }
                    label={
                        showSubtotals
                            ? t('table.general.rowGroupingAlwaysOn')
                            : metricsAsRows
                              ? t('table.general.rowGroupingMetricsAsRows')
                              : isPivotTableEnabled
                                ? t(
                                      'table.general.rowGroupingRequireUnpivotedDimensions',
                                  )
                                : t(
                                      'table.general.rowGroupingRequireDimensions',
                                  )
                    }
                    w={300}
                    position="top-start"
                >
                    <Box>
                        <Checkbox
                            size="xs"
                            label={t('table.general.groupRepeatedRowValues')}
                            checked={
                                showSubtotals ||
                                (canUseSubtotals &&
                                    !metricsAsRows &&
                                    (showRowGrouping ?? false))
                            }
                            onChange={() => {
                                setShowRowGrouping(!showRowGrouping);
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
