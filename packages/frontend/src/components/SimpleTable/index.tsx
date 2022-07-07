import { NonIdealState } from '@blueprintjs/core';
import {
    FieldId,
    formatItemValue,
    friendlyName,
    getResultColumnTotals,
    getResultValues,
    isField,
    isNumericItem,
} from '@lightdash/common';
import React, { FC, useMemo } from 'react';
import Table from '../common/Table';
import { TableColumn } from '../common/Table/types';
import { useVisualizationContext } from '../LightdashVisualization/VisualizationProvider';
import { LoadingChart } from '../SimpleChart';
import { TableWrapper } from './SimpleTable.styles';

const SimpleTable: FC = () => {
    const {
        resultsData,
        isLoading,
        columnOrder,
        tableConfig: { itemMap, headers, isFilterVisible },
    } = useVisualizationContext();

    const tableItems = resultsData?.rows
        ? getResultValues(resultsData?.rows).slice(0, 25)
        : [];

    const totals = useMemo<Record<FieldId, number | undefined>>(() => {
        if (resultsData) {
            return getResultColumnTotals(
                resultsData.rows,
                Object.values(itemMap).filter((item) => isNumericItem(item)),
            );
        }
        return {};
    }, [itemMap, resultsData]);

    const columns = useMemo(() => {
        return Object.entries(itemMap).reduce<TableColumn[]>(
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
    }, [itemMap, totals]);

    const validData = tableItems && headers;
    if (isLoading) return <LoadingChart />;

    return (
        <>
            {validData ? (
                <TableWrapper className="cohere-block">
                    <Table
                        data={tableItems}
                        columns={columns}
                        columnOrder={columnOrder}
                    />
                </TableWrapper>
            ) : (
                <div style={{ padding: '50px 0' }}>
                    <NonIdealState
                        title="No data available"
                        description="Query metrics and dimensions with results."
                        icon="chart"
                    />
                </div>
            )}
        </>
    );
};

export default SimpleTable;
