import {
    formatItemValue,
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
import { Fragment, useMemo } from 'react';
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
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import { useCalculateTotal } from './useCalculateTotal';
import { useExplore } from './useExplore';

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
) => formatCellContent(info.getValue());

export const getValueCell = (info: CellContext<RawResultRow, string>) => {
    const value = info.getValue();
    const formatted = formatRowValueFromWarehouse(value);
    return <span>{formatted}</span>;
};

export const useColumns = (): TableColumn[] => {
    const activeFields = useExplorerContext(
        (context) => context.state.activeFields,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );
    const tableCalculations = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.tableCalculations,
    );
    const customDimensions = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.customDimensions,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );
    const sorts = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.sorts,
    );
    const resultsMetricQuery = useExplorerContext(
        (context) => context.query.data?.metricQuery,
    );
    const resultsFields = useExplorerContext(
        (context) => context.query.data?.fields,
    );

    const { data: exploreData } = useExplore(tableName, {
        refetchOnMount: false,
    });

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
