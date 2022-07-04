import {
    Field,
    FieldId,
    formatItemValue,
    friendlyName,
    getItemMap,
    getResultColumnTotals,
    getResultValues,
    isField,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import { ColumnDef } from '@tanstack/react-table';
import React, { useMemo } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import Table, { TableRow } from '../../common/Table';

export const ExplorerResults2 = () => {
    const {
        state: {
            activeFields,
            unsavedChartVersion: {
                tableName,
                metricQuery: { tableCalculations, additionalMetrics },
            },
        },
        queryResults: { data: resultsData },
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
        return [];
    }, [additionalMetrics, exploreData, tableCalculations, activeFields]);

    const totals = useMemo<Record<FieldId, number | undefined>>(() => {
        if (resultsData) {
            return getResultColumnTotals(
                resultsData.rows,
                Object.values(activeItemsMap).filter((item) =>
                    isNumericItem(item),
                ),
            );
        }
        return {};
    }, [activeItemsMap, resultsData]);

    const columns = useMemo(() => {
        // const rowColumn: ColumnDef<TableRow> = {
        //     id: 'row_number',
        //     header: '#',
        //     cell: (props) => props.row.index + 1,
        //     footer: 'Total',
        //     size: 30,
        // };
        const itemColumns = Object.entries(activeItemsMap).reduce<
            ColumnDef<TableRow>[]
        >((acc, [fieldId, item]) => {
            const column: ColumnDef<TableRow> = {
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
                cell: (info) => info.getValue(),
                footer: () =>
                    totals[fieldId]
                        ? formatItemValue(item, totals[fieldId])
                        : null,
                meta: {
                    field: item,
                },
            };
            return [...acc, column];
        }, []);
        return [...itemColumns];
    }, [activeItemsMap, totals]);

    const data = getResultValues(resultsData?.rows || []);

    return <Table data={data} columns={columns} />;
};
