import {
    convertAdditionalMetric,
    fieldId as getFieldId,
    friendlyName,
    getFields,
    isDimension,
    Metric,
    SortField,
} from 'common';
import React, { useMemo } from 'react';
import { Column } from 'react-table';
import { useExplorer } from '../providers/ExplorerProvider';
import { useExplore } from './useExplore';

const getSortByProps = (
    fieldId: string,
    sortFields: SortField[],
    toggleSortField: (fieldId: string) => void,
) => {
    const getSortByToggleProps = () => ({
        style: {
            cursor: 'pointer',
        },
        title: 'Toggle SortBy',
        onClick: (e: MouseEvent) => toggleSortField(fieldId),
    });

    const sortedIndex = sortFields.findIndex((sf) => fieldId === sf.fieldId);
    return {
        getSortByToggleProps,
        sortedIndex,
        isSorted: sortedIndex !== -1,
        isSortedDesc:
            sortedIndex === -1 ? undefined : sortFields[sortedIndex].descending,
        isMultiSort: sortFields.length > 1,
    };
};

export const useColumns = (): Column<{ [col: string]: any }>[] => {
    const {
        state: {
            activeFields,
            unsavedChartVersion: {
                tableName,
                metricQuery: {
                    sorts: sortFields,
                    tableCalculations,
                    additionalMetrics,
                },
            },
        },
        actions: { toggleSortField },
    } = useExplorer();
    const { data } = useExplore(tableName);
    return useMemo(() => {
        if (data) {
            const fieldColumns = [
                ...getFields(data),
                ...(additionalMetrics || []).reduce<Metric[]>(
                    (acc, additionalMetric) => {
                        const table = data.tables[additionalMetric.table];
                        if (table) {
                            const metric = convertAdditionalMetric({
                                additionalMetric,
                                table,
                            });
                            return [...acc, metric];
                        }
                        return acc;
                    },
                    [],
                ),
            ].reduce<Column<{ [col: string]: any }>[]>((acc, field) => {
                const fieldId = getFieldId(field);
                if (activeFields.has(fieldId)) {
                    return [
                        ...acc,
                        {
                            Header: (
                                <span>
                                    {field.tableLabel} <b>{field.label}</b>
                                </span>
                            ),
                            description:
                                field.description ||
                                `${field.tableLabel} ${field.label}`,
                            accessor: fieldId,
                            type: isDimension(field) ? 'dimension' : 'metric',
                            dimensionType: isDimension(field)
                                ? field.type
                                : undefined,
                            ...getSortByProps(
                                fieldId,
                                sortFields,
                                toggleSortField,
                            ),
                            field,
                        },
                    ];
                }
                return [...acc];
            }, []);
            const tableCalculationColumns = tableCalculations.reduce<
                Column<{ [col: string]: any }>[]
            >((acc, tableCalculation) => {
                const fieldId = tableCalculation.name;
                if (activeFields.has(fieldId)) {
                    return [
                        ...acc,
                        {
                            Header: (
                                <b>{friendlyName(tableCalculation.name)}</b>
                            ),
                            description: friendlyName(tableCalculation.name),
                            accessor: fieldId,
                            type: 'table_calculation',
                            tableCalculation,
                            ...getSortByProps(
                                fieldId,
                                sortFields,
                                toggleSortField,
                            ),
                        },
                    ];
                }
                return [...acc];
            }, []);

            return [...fieldColumns, ...tableCalculationColumns];
        }
        return [];
    }, [
        activeFields,
        data,
        sortFields,
        tableCalculations,
        additionalMetrics,
        toggleSortField,
    ]);
};
