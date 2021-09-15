import React, { FC } from 'react';
import { InputGroup } from '@blueprintjs/core';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

const Input: FC<Omit<InputWrapperProps, 'render'>> = ({ ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => <InputGroup {...props} {...field} />}
    />
);

export default Input;
