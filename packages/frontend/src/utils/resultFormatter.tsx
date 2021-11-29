import { Colors } from '@blueprintjs/core';
import { Dimension, DimensionType } from 'common';
import moment from 'moment';
import React from 'react';

function formatDate(
    timeInterval: string | undefined = 'DAY',
): (date: string | Date) => string {
    return (date: string | Date): string => {
        let dateForm: string;
        switch (timeInterval.toUpperCase()) {
            case 'YEAR':
                dateForm = 'YYYY';
                break;
            case 'MONTH':
                dateForm = 'YYYY-MM';
                break;
            default:
                dateForm = 'YYYY-MM-DD';
                break;
        }
        return moment(date).format(dateForm);
    };
}

function formatTimestamp(
    timeInterval: string | undefined,
    returnReactNode: true,
): (date: string | Date) => React.ReactNode;
function formatTimestamp(
    timeInterval: string | undefined,
    returnReactNode?: false,
): (date: string | Date) => string;
function formatTimestamp(
    timeInterval: string | undefined = 'MILLISECOND',
    returnReactNode: boolean = false,
) {
    return (dateTime: string | Date): string | React.ReactNode => {
        let timeFormat: string;
        switch (timeInterval.toUpperCase()) {
            case 'HOUR':
                timeFormat = 'HH';
                break;
            case 'MINUTE':
                timeFormat = 'HH:mm';
                break;
            case 'SECOND':
                timeFormat = 'HH:mm:ss';
                break;
            default:
                timeFormat = 'HH:mm:ss:SSS';
                break;
        }
        if (!returnReactNode) {
            return moment(dateTime).format(`YYYY-MM-DD, ${timeFormat} (Z)`);
        }
        return (
            <>
                {moment(dateTime).format('YYYY-MM-DD')},{' '}
                {moment(dateTime).format(timeFormat)}{' '}
                <span style={{ color: Colors.GRAY1 }}>
                    {moment(dateTime).format('(Z)')}
                </span>
            </>
        );
    };
}

const formatNumber = (v: number) => `${v}`;
const formatString = (v: string) => `${v}`;
const formatBoolean = (v: boolean | string) =>
    ['True', 'true', 'yes', 'Yes', '1', 'T'].includes(`${v}`) ? 'Yes' : 'No';

function formatWrapper<T>(formatter: (value: any) => T) {
    return ({ value }: any) => {
        if (value === null) return '∅';
        if (value === undefined) return '-';
        return formatter(value);
    };
}

export function getDimensionFormatter(
    d: Dimension,
): ({ value }: any) => string {
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
            return formatWrapper(formatTimestamp(d.timeInterval, false));
        default: {
            const nope: never = dimensionType;
            throw Error(
                `Dimension formatter is not implemented for dimension type ${dimensionType}`,
            );
        }
    }
}

export function getDimensionElementFormatter(
    d: Dimension,
): ({ value }: any) => React.ReactNode {
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
            return formatWrapper(formatTimestamp(d.timeInterval, true));
        default: {
            const nope: never = dimensionType;
            throw Error(
                `Dimension formatter is not implemented for dimension type ${dimensionType}`,
            );
        }
    }
}

export const getMetricFormatter = () => formatWrapper(formatNumber);
