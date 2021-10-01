import {
    BooleanFilter,
    BooleanFilterGroup,
    DateAndTimestampFilter,
    DateFilterGroup,
    FilterGroup,
    friendlyName,
    IFilter,
    NumberFilter,
    NumberFilterGroup,
    StringFilter,
    StringFilterGroup,
} from 'common';
import { Button, HTMLSelect } from '@blueprintjs/core';
import React, { ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid';

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
export const FilterRow = ({
    isFirst,
    isLast,
    tableName,
    fieldName,
    onAdd,
    children,
    onDelete,
}: FilterRowProps) => {
    const header = (
        <span>
            {friendlyName(tableName)} <b>{friendlyName(fieldName)}</b>
        </span>
    );
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'flex-start',
                alignItems: 'center',
            }}
        >
            <div style={{ flex: '0 0 300px' }}>{isFirst && header}</div>
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
// BooleanFilterGroup | StringFilterGroup | DateFilterGroup | NumberFilterGroup
type FilterRowsProps = {
    filterGroup: FilterGroup;
    onChange: (filterGroup: any) => void;
    defaultNewFilter:
        | NumberFilter
        | DateAndTimestampFilter
        | BooleanFilter
        | StringFilter;
    render: ({ filter, index }: { filter: any; index: number }) => ReactNode;
};

export const FilterRows = ({
    filterGroup,
    onChange,
    defaultNewFilter,
    render,
}: FilterRowsProps) => (
    <>
        {filterGroup.filters.map((filter, index) => (
            <FilterRow
                key={`filter_${filter.id}`}
                isFirst={index === 0}
                isLast={index === filterGroup.filters.length - 1}
                tableName={filterGroup.tableName}
                fieldName={filterGroup.fieldName}
                onAdd={() =>
                    onChange({
                        ...filterGroup,
                        filters: [...filterGroup.filters, defaultNewFilter],
                    })
                }
                onDelete={() =>
                    onChange({
                        ...filterGroup,
                        filters: [
                            ...filterGroup.filters.slice(0, index),
                            ...filterGroup.filters.slice(index + 1),
                        ],
                    })
                }
            >
                {render({ filter, index })}
            </FilterRow>
        ))}
    </>
);

type SelectFilterOperatorProps<T extends string> = {
    value: T;
    options: { value: T; label: string }[];
    onChange: (operator: T) => void;
};
export const SelectFilterOperator = <T extends string>({
    value,
    options,
    onChange,
}: SelectFilterOperatorProps<T>) => (
    <HTMLSelect
        fill={false}
        value={value}
        style={{ width: '150px' }}
        minimal
        options={options}
        onChange={(event) => onChange(event.currentTarget.value as T)}
    />
);
