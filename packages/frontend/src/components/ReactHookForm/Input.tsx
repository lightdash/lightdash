import { InputGroup } from '@blueprintjs/core';
import { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

const Input: FC<Omit<InputWrapperProps, 'render'>> = ({ ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => <InputGroup {...props} {...field} />}
    />
);

export default Input;
