import { BooleanFilterGroup } from 'common';
import React from 'react';
import { ControlGroup } from '@blueprintjs/core';
import { FilterRows } from '../FilterRow';
import BooleanFilterForm from './BooleanFilterForm';

type BooleanFilterGroupProps = {
    filterGroup: BooleanFilterGroup;
    onChange: (filterGroup: BooleanFilterGroup) => void;
};

const BooleanFilterGroupForm = ({
    filterGroup,
    onChange,
}: BooleanFilterGroupProps) => (
    <FilterRows
        filterGroup={filterGroup}
        onChange={onChange}
        defaultNewFilter={{ operator: 'is', value: true }}
        render={({ filter, index }) => (
            <ControlGroup style={{ width: '100%' }}>
                <BooleanFilterForm
                    filter={filter}
                    onChange={(fg) =>
                        onChange({
                            ...filterGroup,
                            filters: [
                                ...filterGroup.filters.slice(0, index),
                                fg,
                                ...filterGroup.filters.slice(index + 1),
                            ],
                        })
                    }
                />
            </ControlGroup>
        )}
    />
);

export default BooleanFilterGroupForm;
