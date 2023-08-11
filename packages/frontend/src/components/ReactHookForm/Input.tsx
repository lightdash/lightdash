import { InputGroup } from '@blueprintjs/core';
import React, { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

type FieldProps = {
    rightElement?: React.ComponentProps<typeof InputGroup>['rightElement'];
    readOnly?: React.ComponentProps<typeof InputGroup>['readOnly'];
};
const Input: FC<Omit<InputWrapperProps, 'render'> & FieldProps> = ({
    rightElement,
    ...rest
}) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <InputGroup {...props} {...field} rightElement={rightElement} />
        )}
    />
);

export default Input;
