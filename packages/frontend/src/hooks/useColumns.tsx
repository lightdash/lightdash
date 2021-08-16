import {
    Dimension,
    DimensionType,
    fieldId as getFieldId,
    friendlyName,
    getDimensions,
    getMetrics,
    SortField,
} from 'common';
import React, { useMemo } from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import { useTable } from './useTable';

const formatDate = (date: string | Date) =>
    new Date(date).toISOString().slice(0, 10);
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
            return formatWrapper(formatDate);
        case DimensionType.TIMESTAMP:
            return formatWrapper(formatTimestamp);
        default:
            // eslint-disable-next-line
            const nope: never = dimensionType;
            throw Error(
                `Dimension formatter is not implemented for dimension type ${dimensionType}`,
            );
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
export const useColumns = () => {
    const activeExplore = useTable();
    const {
        state: { activeFields, sorts: sortFields },
        actions: { toggleSortField },
    } = useExplorer();
    const dimensions = useMemo(
        () =>
            activeExplore.data
                ? getDimensions(activeExplore.data).filter((d) =>
                      activeFields.has(getFieldId(d)),
                  )
                : [],
        [activeFields, activeExplore.data],
    );
    const metrics = useMemo(
        () =>
            activeExplore.data
                ? getMetrics(activeExplore.data).filter((m) =>
                      activeFields.has(getFieldId(m)),
                  )
                : [],
        [activeFields, activeExplore.data],
    );
    const dimColumns = useMemo(
        () =>
            dimensions.map((dim) => ({
                Header: (
                    <span>
                        {friendlyName(dim.table)}{' '}
                        <b>{friendlyName(dim.name)}</b>
                    </span>
                ),
                accessor: getFieldId(dim),
                Cell: getDimensionFormatter(dim),
                isDimension: true,
                dimensionType: dim.type,
                ...getSortByProps(getFieldId(dim), sortFields, toggleSortField),
            })),
        [dimensions, sortFields, toggleSortField],
    );
    const metricColumns = useMemo(
        () =>
            metrics.map((m) => ({
                Header: (
                    <span>
                        {friendlyName(m.table)} <b>{friendlyName(m.name)}</b>
                    </span>
                ),
                accessor: getFieldId(m),
                Cell: getMetricFormatter(),
                isDimension: false,
                ...getSortByProps(getFieldId(m), sortFields, toggleSortField),
            })),
        [metrics, sortFields, toggleSortField],
    );
    const result = useMemo(
        () => [...dimColumns, ...metricColumns],
        [dimColumns, metricColumns],
    );
    return result;
};
