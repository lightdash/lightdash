import {
    Field,
    FieldId,
    formatItemValue,
    friendlyName,
    getItemMap,
    getResultColumnTotals,
    getResultValues,
    isDimension,
    isField,
    isNumericItem,
    TableCalculation,
} from '@lightdash/common';
import React, { useMemo } from 'react';
import styled from 'styled-components';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import Table, { TableColumn } from '../../common/Table';
import { CellContextMenu } from '../../ResultsTable/CellContextMenu';
import ColumnHeaderContextMenu from '../../ResultsTable/ColumnHeaderContextMenu';

export const TableContainer = styled.div`
    max-height: 800px;
    padding: 10px;
    display: flex;
`;

export const ExplorerResults2 = () => {
    const {
        state: {
            isEditMode,
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
        return {};
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

    const getItemBgColor = (item: Field | TableCalculation): string => {
        let bgColor: string;

        if (isField(item)) {
            bgColor = isDimension(item) ? '#d2dbe9' : '#e4dad0';
        } else {
            bgColor = '#d2dfd7';
        }
        return bgColor;
    };

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
                        draggable: true,
                        bgColor: getItemBgColor(item),
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
            <Table
                data={data}
                columns={columns}
                cellContextMenu={isEditMode ? CellContextMenu : undefined}
                headerContextMenu={
                    isEditMode ? ColumnHeaderContextMenu : undefined
                }
            />
        </TableContainer>
    );
};
