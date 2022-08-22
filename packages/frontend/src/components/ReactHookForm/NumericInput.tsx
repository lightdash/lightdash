import { NumericInput as NumberInput } from '@blueprintjs/core';
import { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

const NumericInput: FC<Omit<InputWrapperProps, 'render'>> = ({ ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <NumberInput
                fill
                {...props}
                {...field}
                onValueChange={field.onChange}
            />
        )}
    />
);

export default NumericInput;
