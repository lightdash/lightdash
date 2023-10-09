import { HTMLSelect } from '@blueprintjs/core';
import React, { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

type SelectFieldProps = {
    options: React.ComponentProps<typeof HTMLSelect>['options'];
};

const Select: FC<Omit<InputWrapperProps, 'render'> & SelectFieldProps> = ({
    options,
    ...rest
}) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <HTMLSelect fill options={options} {...props} {...field} />
        )}
    />
);
export default Select;
