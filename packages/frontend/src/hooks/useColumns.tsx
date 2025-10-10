import {
    formatItemValue,
    getItemId,
    getItemMap,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    isField,
    isNumericItem,
    isResultValue,
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
import omit from 'lodash/omit';
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
    selectMetricOverrides,
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

const isBarDisplay = (
    info:
        | CellContext<ResultRow, { value: ResultValue }>
        | CellContext<RawResultRow, string>,
) => {
    const minMaxMap = info.table?.options.meta?.minMaxMap;
    const columnProperties = info.table?.options.meta?.columnProperties;

    // For pivot tables, get the base field ID from the item in meta
    // This is needed because pivoted columns have different IDs than the base field
    const item = info.column.columnDef.meta?.item;
    const baseFieldId = item ? getItemId(item) : info.column.id;
    const displayStyle = columnProperties?.[baseFieldId]?.displayStyle;

    return minMaxMap && displayStyle === 'bar';
};

const formatBarDisplayCell = (
    info:
        | CellContext<ResultRow, { value: ResultValue }>
        | CellContext<RawResultRow, string>,
) => {
    const cellValue = info.getValue();
    const columnId = info.column.id;

    const minMaxMap = info.table?.options.meta?.minMaxMap;

    // For pivot tables, get the base field ID from the item in meta
    // This is needed because pivoted columns have different IDs than the base field
    const item = info.column.columnDef.meta?.item;
    const baseFieldId = item ? getItemId(item) : columnId;

    let formatted, value: number;

    if (isResultValue(cellValue)) {
        // Parse value - numeric metrics may return strings from the database (e.g., "1" for count_distinct)
        const rawValue = cellValue.value.raw;
        value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        formatted = cellValue.value.formatted;

        // Only render bar if value is a valid number
        if (Number.isNaN(value)) {
            return formatCellContent(cellValue);
        }
    } else {
        value = Number(cellValue);
        formatted = formatRowValueFromWarehouse(cellValue);
    }

    // Get min/max from minMaxMap (same as conditional formatting)
    // For pivot tables, try baseFieldId first so all pivoted versions share the same scale
    // Fall back to columnId for individual column scales
    const minMax = minMaxMap[baseFieldId] ?? minMaxMap[columnId];
    const min = minMax?.min ?? 0;
    const max = minMax?.max ?? 100;

    return renderBarChartDisplay({
        value,
        formatted,
        min,
        max,
    });
};

export const getFormattedValueCell = (
    info: CellContext<ResultRow, { value: ResultValue }>,
) => {
    const cellValue = info.getValue();

    try {
        if (isBarDisplay(info)) return formatBarDisplayCell(info);
    } catch (error) {
        console.error(`Unable to format value for bar display cell ${error}`);
    }

    return formatCellContent(cellValue);
};

export const getValueCell = (info: CellContext<RawResultRow, string>) => {
    const value = info.getValue();

    try {
        if (isBarDisplay(info)) return formatBarDisplayCell(info);
    } catch (error) {
        console.error(`Unable to get value for bar display cell ${error}`);
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
    const metricOverrides = useExplorerSelector(selectMetricOverrides);

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
        if (!exploreData) return;

        const baseItemsMap = getItemMap(
            exploreData,
            additionalMetrics,
            tableCalculations,
            customDimensions,
        );

        const mergedMap = {
            ...baseItemsMap,
            ...(resultsFields || {}),
        };

        // Apply metric overrides and remove legacy format properties
        // to ensure formatItemValue uses new formatOptions instead of old format expressions
        return Object.fromEntries(
            Object.entries(mergedMap).map(([key, value]) => {
                if (!metricOverrides?.[key]) return [key, value];
                const itemWithoutLegacyFormat = omit(value, [
                    'format',
                    'round',
                ]);
                return [
                    key,
                    {
                        ...itemWithoutLegacyFormat,
                        ...metricOverrides[key],
                    },
                ];
            }),
        );
    }, [
        resultsFields,
        exploreData,
        additionalMetrics,
        tableCalculations,
        customDimensions,
        metricOverrides,
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
                    cell: (
                        info: CellContext<ResultRow, { value: ResultValue }>,
                    ) => {
                        const cellValue = info.getValue();
                        if (!cellValue) return '-';
                        // Use item from meta to ensure we get the latest version with overrides
                        const currentItem = info.column.columnDef.meta?.item;
                        return formatItemValue(
                            currentItem,
                            cellValue.value.raw,
                        );
                    },
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
