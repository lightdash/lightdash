import React from 'react';
import { BooleanFilter } from 'common';
import { HTMLSelect } from '@blueprintjs/core';

type BooleanFilterFormProps = {
    filter: BooleanFilter;
    onChange: (filter: BooleanFilter) => void;
};

const BooleanFilterForm = ({ filter, onChange }: BooleanFilterFormProps) => (
    <HTMLSelect
        fill
        minimal
        onChange={(e) =>
            onChange({ ...filter, value: e.currentTarget.value === 'true' })
        }
        options={[
            { value: 'true', label: 'True' },
            { value: 'false', label: 'False' },
        ]}
        value={filter.value ? 'true' : 'false'}
    />
);

export default BooleanFilterForm;
