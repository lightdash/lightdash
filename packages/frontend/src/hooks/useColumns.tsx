import {
    Field,
    formatItemValue,
    friendlyName,
    getItemMap,
    isDimension,
    isField,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import React, { useMemo } from 'react';
import { TableColumn } from '../components/common/Table/types';
import { useExplorer } from '../providers/ExplorerProvider';
import useColumnTotals from './useColumnTotals';
import { useExplore } from './useExplore';

export const useColumns = (): TableColumn[] => {
    const {
        state: {
            activeFields,
            unsavedChartVersion: {
                tableName,
                metricQuery: { tableCalculations, additionalMetrics, sorts },
            },
        },
        queryResults: { data: resultsData },
        actions: { toggleSortField, setSortFields },
    } = useExplorer();
    const { data: exploreData } = useExplore(tableName);

    const activeItemsMap = useMemo(() => {
        if (exploreData) {
            const allItemsMap = getItemMap(
                exploreData,
                additionalMetrics,
                tableCalculations,
            );
            return Object.entries(allItemsMap).reduce<
                Record<string, Field | TableCalculation>
            >(
                (acc, [key, value]) =>
                    activeFields.has(key)
                        ? {
                              ...acc,
                              [key]: value,
                          }
                        : acc,
                {},
            );
        }
        return {};
    }, [additionalMetrics, exploreData, tableCalculations, activeFields]);

    const totals = useColumnTotals({
        resultsData,
        itemsMap: activeItemsMap,
    });

    const getItemBgColor = (item: Field | TableCalculation): string => {
        let bgColor: string;

        if (isField(item)) {
            bgColor = isDimension(item) ? '#d2dbe9' : '#e4dad0';
        } else {
            bgColor = '#d2dfd7';
        }
        return bgColor;
    };

    return useMemo(() => {
        return Object.entries(activeItemsMap).reduce<TableColumn[]>(
            (acc, [fieldId, item]) => {
                const sortIndex = sorts.findIndex(
                    (sf) => fieldId === sf.fieldId,
                );
                const isFieldSorted = sortIndex !== -1;
                const column: TableColumn = {
                    id: fieldId,
                    header: () =>
                        isField(item) ? (
                            <span>
                                {item.tableLabel} <b>{item.label}</b>
                            </span>
                        ) : (
                            <b>{item.displayName || friendlyName(item.name)}</b>
                        ),
                    accessorKey: fieldId,
                    cell: (info) => info.getValue()?.value.formatted || '-',
                    footer: () =>
                        totals[fieldId]
                            ? formatItemValue(item, totals[fieldId])
                            : null,
                    meta: {
                        item,
                        draggable: true,
                        bgColor: getItemBgColor(item),
                        sort: isFieldSorted
                            ? {
                                  sortIndex,
                                  sort: sorts[sortIndex],
                                  isMultiSort: sorts.length > 1,
                                  isNumeric: isNumericItem(item),
                              }
                            : undefined,
                        onHeaderClick: (e) => {
                            if (e.metaKey || e.ctrlKey || isFieldSorted) {
                                toggleSortField(fieldId);
                            } else {
                                setSortFields([
                                    {
                                        fieldId,
                                        descending: isFieldSorted
                                            ? !sorts[sortIndex].descending
                                            : false,
                                    },
                                ]);
                            }
                        },
                    },
                };
                return [...acc, column];
            },
            [],
        );
    }, [activeItemsMap, sorts, totals, toggleSortField, setSortFields]);
};
