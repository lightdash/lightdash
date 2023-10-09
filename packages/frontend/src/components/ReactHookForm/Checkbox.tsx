import { Checkbox as BluePrintCheckbox } from '@blueprintjs/core';
import React, { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

interface Props extends Omit<InputWrapperProps, 'render'> {
    checkboxProps?: React.ComponentProps<typeof BluePrintCheckbox>;
}

const Checkbox: FC<Props> = ({ checkboxProps, ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <BluePrintCheckbox
                inline
                {...checkboxProps}
                checked={field.value}
                {...props}
                {...field}
            />
        )}
    />
);
export default Checkbox;
