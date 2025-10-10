import {
    formatItemValue,
    getItemId,
    getItemMap,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isNumericItem,
    itemsInMetricQuery,
    type AdditionalMetric,
    type CustomDimension,
    type Field,
    type ItemsMap,
    type RawResultRow,
    type ResultRow,
    type ResultValue,
    type TableCalculation,
} from '@lightdash/common';
import { Group, Tooltip } from '@mantine/core';
import { IconExclamationCircle } from '@tabler/icons-react';
import { type CellContext } from '@tanstack/react-table';
import { useMemo } from 'react';
import { formatRowValueFromWarehouse } from '../components/DataViz/formatters/formatRowValueFromWarehouse';
import MantineIcon from '../components/common/MantineIcon';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../components/common/Table/Table.styles';
import {
    columnHelper,
    type TableColumn,
} from '../components/common/Table/types';
import useEmbed from '../ee/providers/Embed/useEmbed';
import {
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectParameters,
    selectSorts,
    selectTableCalculations,
    selectTableName,
    useExplorerSelector,
} from '../features/explorer/store';
import { renderBarChartDisplay } from './barChartDisplay';
import { useCalculateTotal } from './useCalculateTotal';
import { useExplore } from './useExplore';
import { useExplorerQuery } from './useExplorerQuery';

export const getItemBgColor = (
    item: Field | AdditionalMetric | TableCalculation | CustomDimension,
): string => {
    if (isCustomDimension(item)) return '#d2dbe9';
    if (isField(item) || isAdditionalMetric(item)) {
        return isDimension(item) ? '#d2dbe9' : '#e4dad0';
    } else {
        return '#d2dfd7';
    }
};

export const formatCellContent = (data?: { value: ResultValue }) => {
    return data?.value.formatted ?? '-';
};

export const getFormattedValueCell = (
    info: CellContext<ResultRow, { value: ResultValue }>,
) => {
    const cellValue = info.getValue();
    const columnId = info.column.id;

    // Check if this column has bar display style (only for chart tables, not results table)
    // Bar display requires minMaxMap to be provided (similar to conditional formatting)
    const minMaxMap = (info.table as any).options.meta?.minMaxMap;
    const columnProperties = (info.table as any).options.meta?.columnProperties;

    // For pivot tables, get the base field ID from the item in meta
    // This is needed because pivoted columns have different IDs than the base field
    const item = info.column.columnDef.meta?.item;
    const baseFieldId = item ? getItemId(item) : columnId;
    const displayStyle = columnProperties?.[baseFieldId]?.displayStyle;

    // Get item from column meta to check if it's numeric
    const item = info.column.columnDef.meta?.item;

    // Use bar display layout for numeric fields when displayStyle is 'bar'
    if (
        minMaxMap && // Only apply bar display in chart viz (not results table)
        displayStyle === 'bar' &&
        cellValue?.value?.raw != null &&
        item &&
        isNumericItem(item) // Check if field type is numeric (handles count metrics that return strings)
    ) {
        // Parse value - numeric metrics may return strings from the database (e.g., "1" for count_distinct)
        const rawValue = cellValue.value.raw;
        const value =
            typeof rawValue === 'number' ? rawValue : Number(rawValue);
        const formatted = cellValue.value.formatted;

        // Only render bar if value is a valid number
        if (Number.isNaN(value)) {
            return formatCellContent(cellValue);
        }

        // Get min/max from minMaxMap (same as conditional formatting)
        const min = minMaxMap[columnId]?.min ?? 0;
        const max = minMaxMap[columnId]?.max ?? 100;

        return renderBarChartDisplay({
            value,
            formatted,
            min,
            max,
        });
    }

    return formatCellContent(cellValue);
};

export const getValueCell = (info: CellContext<RawResultRow, string>) => {
    const value = info.getValue();
    const columnId = info.column.id;

    // Check if this column has bar display style
    const columnConfig = info.table.options.meta?.columnsConfig?.[columnId];
    const columnStats = info.table.options.meta?.columnStats?.[columnId];

    if (columnConfig?.displayStyle === 'bar' && typeof value === 'number') {
        // Get min/max from config or calculated stats
        const min = columnConfig.barConfig?.min ?? columnStats?.min ?? 0;
        const max = columnConfig.barConfig?.max ?? columnStats?.max ?? 100;
        const color = columnConfig.barConfig?.color ?? '#5470c6';

        // Calculate bar width percentage
        const range = max - min;
        const percentage =
            range > 0
                ? Math.max(0, Math.min(100, ((value - min) / range) * 100))
                : 0;

        const formatted = formatRowValueFromWarehouse(value);

        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                }}
            >
                <div
                    style={{
                        width: `${percentage}%`,
                        minWidth: percentage > 0 ? '2px' : '0',
                        height: '20px',
                        backgroundColor: color,
                        borderRadius: '2px',
                    }}
                />
                <span
                    style={{
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                    }}
                >
                    {formatted}
                </span>
            </div>
        );
    }

    // Default text rendering
    const formatted = formatRowValueFromWarehouse(value);
    return <span>{formatted}</span>;
};

export const useColumns = (): TableColumn[] => {
    // Use Redux for state that's available
    const tableName = useExplorerSelector(selectTableName);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const sorts = useExplorerSelector(selectSorts);

    // Get state from new query hook
    const { activeFields, query } = useExplorerQuery();
    const resultsMetricQuery = query.data?.metricQuery;
    const resultsFields = query.data?.fields;

    // Get parameters from Redux
    const parameters = useExplorerSelector(selectParameters);

    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
    });

    const { embedToken } = useEmbed();

    const itemsMap = useMemo<ItemsMap | undefined>(() => {
        if (exploreData) {
            // Explore items for new columns and result items for existing columns with format overrides
            return {
                ...getItemMap(
                    exploreData,
                    additionalMetrics,
                    tableCalculations,
                    customDimensions,
                ),
                ...(resultsFields || {}),
            };
        }
    }, [
        resultsFields,
        exploreData,
        additionalMetrics,
        tableCalculations,
        customDimensions,
    ]);

    const { activeItemsMap, invalidActiveItems } = useMemo<{
        activeItemsMap: ItemsMap;
        invalidActiveItems: string[];
    }>(() => {
        if (itemsMap) {
            return Array.from(activeFields).reduce<{
                activeItemsMap: ItemsMap;
                invalidActiveItems: string[];
            }>(
                (acc, key) => {
                    const item = itemsMap?.[key];
                    return item
                        ? {
                              ...acc,
                              activeItemsMap: {
                                  ...acc.activeItemsMap,
                                  [key]: item,
                              },
                          }
                        : {
                              ...acc,
                              invalidActiveItems: [
                                  ...acc.invalidActiveItems,
                                  key,
                              ],
                          };
                },
                { activeItemsMap: {}, invalidActiveItems: [] },
            );
        }
        return { activeItemsMap: {}, invalidActiveItems: [] };
    }, [itemsMap, activeFields]);

    const { data: totals } = useCalculateTotal({
        metricQuery: resultsMetricQuery,
        explore: exploreData?.baseTable,
        fieldIds: resultsMetricQuery
            ? itemsInMetricQuery(resultsMetricQuery)
            : undefined,
        itemsMap: activeItemsMap,
        embedToken,
        parameters,
    });

    return useMemo(() => {
        const validColumns = Object.entries(activeItemsMap).reduce<
            TableColumn[]
        >((acc, [fieldId, item]) => {
            const hasJoins = (exploreData?.joinedTables || []).length > 0;

            const sortIndex = sorts.findIndex((sf) => fieldId === sf.fieldId);
            const isFieldSorted = sortIndex !== -1;
            const column: TableColumn = columnHelper.accessor(
                (row) => row[fieldId],
                {
                    id: fieldId,
                    header: () => (
                        <TableHeaderLabelContainer>
                            {isField(item) ? (
                                <>
                                    {hasJoins && (
                                        <TableHeaderRegularLabel>
                                            {item.tableLabel}{' '}
                                        </TableHeaderRegularLabel>
                                    )}

                                    <TableHeaderBoldLabel>
                                        {item.label}
                                    </TableHeaderBoldLabel>
                                </>
                            ) : isCustomDimension(item) ? (
                                <TableHeaderBoldLabel>
                                    {item.name}
                                </TableHeaderBoldLabel>
                            ) : (
                                <TableHeaderBoldLabel>
                                    {item && 'displayName' in item
                                        ? item.displayName
                                        : 'Undefined'}
                                </TableHeaderBoldLabel>
                            )}
                        </TableHeaderLabelContainer>
                    ),
                    cell: getFormattedValueCell,
                    footer: () =>
                        totals?.[fieldId]
                            ? formatItemValue(item, totals[fieldId])
                            : null,
                    meta: {
                        item,
                        draggable: true,
                        frozen: false,
                        bgColor: getItemBgColor(item),
                        sort: isFieldSorted
                            ? {
                                  sortIndex,
                                  sort: sorts[sortIndex],
                                  isMultiSort: sorts.length > 1,
                                  isNumeric: isNumericItem(item),
                              }
                            : undefined,
                    },
                },
            );
            return [...acc, column];
        }, []);

        const invalidColumns = invalidActiveItems.reduce<TableColumn[]>(
            (acc, fieldId) => {
                const column: TableColumn = columnHelper.accessor(
                    (row) => row[fieldId],
                    {
                        id: fieldId,
                        header: () => (
                            <Group spacing="two">
                                <Tooltip
                                    withinPortal
                                    label="This field was not found in the dbt project."
                                    position="top"
                                >
                                    <MantineIcon
                                        display="inline"
                                        icon={IconExclamationCircle}
                                        color="yellow"
                                    />
                                </Tooltip>

                                <TableHeaderBoldLabel
                                    style={{ marginLeft: 10 }}
                                >
                                    {fieldId}
                                </TableHeaderBoldLabel>
                            </Group>
                        ),
                        cell: getFormattedValueCell,
                        meta: {
                            isInvalidItem: true,
                        },
                    },
                );
                return [...acc, column];
            },
            [],
        );
        return [...validColumns, ...invalidColumns];
    }, [activeItemsMap, invalidActiveItems, sorts, totals, exploreData]);
};
