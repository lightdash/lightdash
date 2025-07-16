import { type LightdashProjectParameter } from '@lightdash/common';
import { Select } from '@mantine/core';
import { type FC } from 'react';

type ParameterInputProps = {
    paramKey: string;
    parameter: LightdashProjectParameter;
    value: string | string[] | null;
    onParameterChange: (paramKey: string, value: string | null) => void;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
};

export const ParameterInput: FC<ParameterInputProps> = ({
    paramKey,
    parameter,
    value,
    onParameterChange,
    size,
}) => {
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
