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
import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import Table, { TableColumn } from '../../common/Table';

export const TableContainer = styled.div`
    flex: 1;
    max-height: 812px;
    padding: 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

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
        return Object.entries(activeItemsMap).reduce<TableColumn[]>(
            (acc, [fieldId, item]) => {
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
                    cell: (info) => info.getValue() || '-',
                    footer: () =>
                        totals[fieldId]
                            ? formatItemValue(item, totals[fieldId])
                            : null,
                    meta: {
                        item,
                    },
                };
                return [...acc, column];
            },
            [],
        );
    }, [activeItemsMap, totals]);

    const data = getResultValues(resultsData?.rows || []);

    return (
        <TableContainer>
            <Table data={data} columns={columns} />
        </TableContainer>
    );
};
