import { TagInput as BlueprintTagInput } from '@blueprintjs/core';
import { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

const TagInput: FC<Omit<InputWrapperProps, 'render'>> = ({ ...rest }) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <BlueprintTagInput
                fill
                addOnBlur
                tagProps={{ minimal: true }}
                {...props}
                {...field}
                values={field.value}
            />
        )}
    />
);
export default TagInput;
