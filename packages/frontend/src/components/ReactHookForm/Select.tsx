import { HTMLSelect } from '@blueprintjs/core';
import React, { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

interface SelectFieldProps extends Omit<InputWrapperProps, 'render'> {
    options: React.ComponentProps<typeof HTMLSelect>['options'];
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
