import { HTMLSelect } from '@blueprintjs/core';
import React from 'react';

type SelectFilterOperatorProps<T extends string> = {
    value: T;
    options: { value: T; label: string }[];
    onChange: (operator: T) => void;
};

const SelectFilterOperator = <T extends string>({
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

export default SelectFilterOperator;
