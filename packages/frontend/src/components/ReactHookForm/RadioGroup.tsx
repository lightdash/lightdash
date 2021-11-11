import React, { FC } from 'react';
import { RadioGroup as BlueprintRadioGroup } from '@blueprintjs/core';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

const RadioGroup: FC<Omit<InputWrapperProps, 'render'>> = ({ ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <BlueprintRadioGroup
                {...props}
                {...field}
                selectedValue={field.value}
            />
        )}
    />
);
export default RadioGroup;
