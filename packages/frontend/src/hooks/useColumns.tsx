import {
    fieldId as getFieldId,
    friendlyName,
    getFields,
    isDimension,
    SortField,
} from 'common';
import React, { useMemo } from 'react';
import { Column } from 'react-table';
import { useExplorer } from '../providers/ExplorerProvider';
import {
    getDimensionElementFormatter,
    getMetricFormatter,
} from '../utils/resultFormatter';
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
            sorts: sortFields,
            tableCalculations,
            tableName,
        },
        actions: { toggleSortField },
    } = useExplorer();
    const { data } = useExplore(tableName);
    return useMemo(() => {
        if (data) {
            const fieldColumns = getFields(data).reduce<
                Column<{ [col: string]: any }>[]
            >((acc, field) => {
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
                            Cell: isDimension(field)
                                ? getDimensionElementFormatter(field)
                                : getMetricFormatter(),
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
                            Cell: getMetricFormatter(),
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
    }, [activeFields, data, sortFields, tableCalculations, toggleSortField]);
};
