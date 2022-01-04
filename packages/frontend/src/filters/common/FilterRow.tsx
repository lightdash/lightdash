import { Button, Colors } from '@blueprintjs/core';
import {
    BooleanFilter,
    DateAndTimestampFilter,
    NumberFilter,
    StringFilter,
} from 'common';
import React, { ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useField } from '../../hooks/useField';

type Filter =
    | NumberFilter
    | StringFilter
    | DateAndTimestampFilter
    | BooleanFilter;
export const assertFilterId = <T extends Filter>(
    filter: T,
): T & { id: string } => {
    const { id } = filter;
    if (id !== undefined) {
        return { ...filter, id };
    }
    return { ...filter, id: uuidv4() };
};

type FilterRowProps = {
    isFirst: boolean;
    isLast: boolean;
    tableName: string;
    fieldName: string;
    onAdd: () => void;
    onDelete: () => void;
    children: ReactNode;
};

const FilterRow = ({
    isFirst,
    isLast,
    tableName,
    fieldName,
    onAdd,
    children,
    onDelete,
}: FilterRowProps) => {
    const { field } = useField(fieldName, tableName);
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center',
            }}
        >
            <div style={{ flex: '0 0 300px' }}>
                {isFirst ? (
                    !field ? (
                        'Field not found'
                    ) : (
                        <span>
                            {field.tableLabel} <b>{field.label}</b>
                        </span>
                    )
                ) : null}
            </div>
            <div style={{ flex: '0 0 40px' }}>
                {!isFirst && (
                    <span style={{ paddingLeft: 5, color: Colors.GREEN1 }}>
                        AND
                    </span>
                )}
            </div>
            <div
                style={{
                    maxWidth: '400px',
                    flex: '1 0 auto',
                    display: 'flex',
                    flexDirection: 'row',
                    justifyContent: 'flex-start',
                }}
            >
                {children}
            </div>
            <div
                style={{
                    flex: '0 0 70px',
                    display: 'flex',
                    justifyContent: 'flex-start',
                }}
            >
                <Button minimal icon="cross" onClick={onDelete} />
                {isLast && <Button minimal icon="plus" onClick={onAdd} />}
            </div>
        </div>
    );
};

export default FilterRow;
