import { FilterGroup } from 'common';
import React, { ReactNode } from 'react';
import FilterRow from './FilterRow';

type FilterRowsProps<T extends FilterGroup> = {
    filterGroup: T;
    onChange: (filterGroup: T) => void;
    defaultNewFilter: T['filters'][number];
    render: ({
        filter,
        index,
    }: {
        filter: T['filters'][number];
        index: number;
    }) => ReactNode;
};

const FilterRows = <T extends FilterGroup>({
    filterGroup,
    onChange,
    defaultNewFilter,
    render,
}: FilterRowsProps<T>) => (
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
export default FilterRows;
