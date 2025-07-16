import { type LightdashProjectParameter } from '@lightdash/common';
import { MultiSelect, Select } from '@mantine/core';
import React, { type FC } from 'react';

type ParameterInputProps = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    value: string | string[] | null;
    onParameterChange: (
        paramKey: string,
        value: string | string[] | null,
    ) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

export const ParameterInput: FC<ParameterInputProps> = ({
    paramKey,
    parameter,
    value,
    onParameterChange,
    size,
}) => {
    if (parameter.multiple) {
        return (
            <MultiSelect
                data={parameter.options ?? []}
                value={value ? (Array.isArray(value) ? value : [value]) : []}
                onChange={(newValue) => onParameterChange(paramKey, newValue)}
                placeholder="Choose value..."
                size={size}
                searchable
                clearable
            />
        );
    }

    return (
        <Select
            placeholder="Choose value..."
            value={Array.isArray(value) ? value[0] || null : value || null}
            onChange={(newValue) => onParameterChange(paramKey, newValue)}
            data={parameter.options ?? []}
            size={size}
            searchable
            clearable
        />
    );
};
