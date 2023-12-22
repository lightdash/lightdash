import { Switch } from '@mantine/core';
import React, { FC } from 'react';
import InputWrapper, { InputWrapperProps } from './InputWrapper';

interface Props extends Omit<InputWrapperProps, 'render'> {
    switchProps?: React.ComponentProps<typeof Switch>;
}

const BooleanSwitch: FC<React.PropsWithChildren<Props>> = ({
    switchProps,
    ...rest
}) => (
    <InputWrapper
        {...rest}
        render={(props, { field }) => (
            <Switch
                onLabel="Yes"
                offLabel="No"
                {...switchProps}
                checked={field.value}
                {...props}
                {...field}
                size="md"
            />
        )}
    />
);
export default BooleanSwitch;
