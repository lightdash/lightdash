import { HTMLSelect } from '@blueprintjs/core';
import React, { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

interface SelectFieldProps extends Omit<InputWrapperProps, 'render'> {
    options: React.ComponentProps<typeof HTMLSelect>['options'];
    onChange?: React.FormEvent<HTMLSelectElement> | undefined;
}

const Select: FC<SelectFieldProps> = ({ options, ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <HTMLSelect fill options={options} {...props} {...field} />
        )}
    />
);
export default Select;
