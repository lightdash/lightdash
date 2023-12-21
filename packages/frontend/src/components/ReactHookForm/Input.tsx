import { TextInput } from '@mantine/core';
import React, { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

type FieldProps = {
    rightElement?: React.ReactNode;
};
const Input: FC<Omit<InputWrapperProps, 'render'> & FieldProps> = ({
    rightElement,
    ...rest
}) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <TextInput {...props} {...field} rightSection={rightElement} />
        )}
    />
);

export default Input;
