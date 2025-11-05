import {
    DimensionType,
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
    type ParametersValuesMap,
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
import { TableCellBar } from './TableCellBar';
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

export const formatCellContent = (
    data?: { value: ResultValue },
    item?: Field | AdditionalMetric | TableCalculation | CustomDimension,
    parameters?: ParametersValuesMap,
) => {
    if (!data) return '-';

    // Only re-format on frontend when there are parameters and the format uses them
    // Otherwise, use the pre-formatted value from backend
    const hasParameterFormat =
        item &&
        'format' in item &&
        typeof item.format === 'string' &&
        (item.format.includes('${ld.parameters') ||
            item.format.includes('${lightdash.parameters'));

    if (hasParameterFormat && parameters) {
        return formatItemValue(item, data.value.raw, false, parameters);
    }

    // Use backend-formatted value by default
    return data.value.formatted ?? '-';
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
    parameters?: ParametersValuesMap,
) => {
    const cellValue = info.getValue();
    const columnId = info.column.id;
    const columnProperties = info.table?.options.meta?.columnProperties;
    const minMaxMap = info.table?.options.meta?.minMaxMap;
    const color = columnProperties?.[columnId]?.color;

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
            return formatCellContent(cellValue, item, parameters);
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

    return (
        <TableCellBar
            value={value}
            formatted={formatted}
            min={min}
            max={max}
            color={color}
        />
    );
};

export const getFormattedValueCell = (
    info: CellContext<ResultRow, { value: ResultValue }>,
    parameters?: ParametersValuesMap,
) => {
    const cellValue = info.getValue();
    const item = info.column.columnDef.meta?.item;

    try {
        if (isBarDisplay(info)) return formatBarDisplayCell(info, parameters);
    } catch (error) {
        console.error(`Unable to format value for bar display cell ${error}`);
    }

    return formatCellContent(cellValue, item, parameters);
};

export const getValueCell = (
    info: CellContext<RawResultRow, string>,
    parameters?: ParametersValuesMap,
) => {
    const value = info.getValue();

    try {
        if (isBarDisplay(info)) return formatBarDisplayCell(info, parameters);
    } catch (error) {
        console.error(`Unable to get value for bar display cell ${error}`);
    }

    // Default text rendering
    const formatted = formatRowValueFromWarehouse(value);
    return <span>{formatted}</span>;
};

export const useColumns = (): TableColumn[] => {
    const tableName = useExplorerSelector(selectTableName);
    const tableCalculations = useExplorerSelector(selectTableCalculations);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const sorts = useExplorerSelector(selectSorts);
    const metricOverrides = useExplorerSelector(selectMetricOverrides);

    const { activeFields, query } = useExplorerQuery();
    const resultsMetricQuery = query.data?.metricQuery;
    const resultsFields = query.data?.fields;

    const parameters = useExplorerSelector(selectParameters);

    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
    });

    const { embedToken } = useEmbed();

    const hasNoActiveFields = activeFields.size === 0;

    // Split itemsMap into base map (rarely changes) and override layer (frequently changes)
    // This prevents full recalculation when only metricOverrides change
    const baseItemsMap = useMemo<ItemsMap | undefined>(() => {
        if (!exploreData || hasNoActiveFields) return;

        const baseFields = getItemMap(
            exploreData,
            additionalMetrics,
            tableCalculations,
            customDimensions,
        );

        return {
            ...baseFields,
            ...(resultsFields || {}),
        };
    }, [
        hasNoActiveFields,
        resultsFields,
        exploreData,
        additionalMetrics,
        tableCalculations,
        customDimensions,
    ]);

    // Apply metric overrides as a separate layer
    const itemsMap = useMemo<ItemsMap | undefined>(() => {
        if (!baseItemsMap) return;

        // If no overrides, return base map directly
        if (!metricOverrides || Object.keys(metricOverrides).length === 0) {
            return baseItemsMap;
        }

        // Only apply overrides to items that have them
        return Object.fromEntries(
            Object.entries(baseItemsMap).map(([key, value]) => {
                const isFromResults = resultsFields && key in resultsFields;
                if (isFromResults) {
                    return [key, value];
                }

                if (!metricOverrides[key]) return [key, value];

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
    }, [baseItemsMap, metricOverrides, resultsFields]);

    const { activeItemsMap, invalidActiveItems } = useMemo<{
        activeItemsMap: ItemsMap;
        invalidActiveItems: string[];
    }>(() => {
        if (!itemsMap) {
            return { activeItemsMap: {}, invalidActiveItems: [] };
        }

        const result: {
            activeItemsMap: ItemsMap;
            invalidActiveItems: string[];
        } = {
            activeItemsMap: {},
            invalidActiveItems: [],
        };

        // Filter itemsMap to only include active fields
        // This is more efficient than spreading objects in a reduce
        for (const key of activeFields) {
            const item = itemsMap[key];
            if (item) {
                result.activeItemsMap[key] = item;
            } else {
                result.invalidActiveItems.push(key);
            }
        }

        return result;
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
        if (hasNoActiveFields) {
            return [];
        }

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

                        // For DATE and TIMESTAMP types, use the pre-formatted value from backend
                        // to avoid timezone issues when re-parsing UTC date strings on the frontend
                        if (
                            isField(currentItem) &&
                            (currentItem.type === DimensionType.DATE ||
                                currentItem.type === DimensionType.TIMESTAMP)
                        ) {
                            return cellValue.value.formatted;
                        }

                        // For everything else (metrics, numbers, etc.), format on frontend
                        // to support metric overrides and other client-side formatting
                        return formatItemValue(
                            currentItem,
                            cellValue.value.raw,
                            false,
                            parameters,
                        );
                    },
                    footer: () =>
                        totals?.[fieldId]
                            ? formatItemValue(
                                  item,
                                  totals[fieldId],
                                  false,
                                  parameters,
                              )
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
    }, [
        hasNoActiveFields,
        activeItemsMap,
        invalidActiveItems,
        sorts,
        totals,
        exploreData,
        parameters,
    ]);
};
