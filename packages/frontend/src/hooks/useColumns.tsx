import {
    Dimension,
    DimensionType,
    fieldId as getFieldId,
    friendlyName,
    getFields,
    isDimension,
    SortField,
} from 'common';
import moment from 'moment';
import React, { useMemo } from 'react';
import { Column } from 'react-table';
import { useExplorer } from '../providers/ExplorerProvider';
import { useExplore } from './useExplore';

const getTimeIntervalFormat = (timeInterval?: string) => {
    let format = 'YYYY-MM-DD';
    if (timeInterval) {
        switch (timeInterval.toUpperCase()) {
            case 'YEAR':
                format = 'YYYY';
                break;
            case 'MONTH':
                format = 'YYYY-MM';
                break;
            default:
                format = 'YYYY-MM-DD';
        }
    }
    return format;
};

const formatDate = (timeInterval?: string) => (date: string | Date) =>
    moment(date).format(getTimeIntervalFormat(timeInterval));
const formatTimestamp = (datetime: string | Date) =>
    new Date(datetime).toISOString();
const formatNumber = (v: number) => `${v}`;
const formatString = (v: string) => `${v}`;
const formatBoolean = (v: boolean | string) =>
    ['True', 'true', 'yes', 'Yes', '1', 'T'].includes(`${v}`) ? 'Yes' : 'No';
const formatWrapper =
    (formatter: (value: any) => string) =>
    ({ value }: any) => {
        if (value === null) return '∅';
        if (value === undefined) return '-';
        return formatter(value);
    };
export const getDimensionFormatter = (d: Dimension) => {
    const dimensionType = d.type;
    switch (dimensionType) {
        case DimensionType.STRING:
            return formatWrapper(formatString);
        case DimensionType.NUMBER:
            return formatWrapper(formatNumber);
        case DimensionType.BOOLEAN:
            return formatWrapper(formatBoolean);
        case DimensionType.DATE:
            return formatWrapper(formatDate(d.timeInterval));
        case DimensionType.TIMESTAMP:
            return formatWrapper(formatTimestamp);
        default: {
            const nope: never = dimensionType;
            throw Error(
                `Dimension formatter is not implemented for dimension type ${dimensionType}`,
            );
        }
    }
};
const getMetricFormatter = () => formatWrapper(formatNumber);
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
                                    {friendlyName(field.table)}{' '}
                                    <b>{friendlyName(field.name)}</b>
                                </span>
                            ),
                            accessor: fieldId,
                            Cell: isDimension(field)
                                ? getDimensionFormatter(field)
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
