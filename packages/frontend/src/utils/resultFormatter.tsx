import { Colors } from '@blueprintjs/core';
import moment from 'moment';
import React from 'react';

export function formatDate(
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

export function formatTimestamp(
    timeInterval: string | undefined,
    returnReactNode: true,
): (date: string | Date) => React.ReactNode;
export function formatTimestamp(
    timeInterval: string | undefined,
    returnReactNode?: false,
): (date: string | Date) => string;
export function formatTimestamp(
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

export const formatBoolean = (v: boolean | string) =>
    ['True', 'true', 'yes', 'Yes', '1', 'T'].includes(`${v}`) ? 'Yes' : 'No';
