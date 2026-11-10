import { type CustomFormat } from '@lightdash/common';
import { type UseFormReturnType } from '@mantine/form';
import { type ChangeEvent } from 'react';

type FormatInputProps = ReturnType<
    UseFormReturnType<CustomFormat>['getInputProps']
>;

// Keeps optional text fields controlled while storing a cleared field as unset
export const formatTextInputProps = (props: FormatInputProps) => ({
    ...props,
    value: props.value ?? '',
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
        props.onChange(event.currentTarget.value || undefined),
});
