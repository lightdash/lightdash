import React, { FC, ReactElement } from 'react';
import { Controller, get, useFormContext } from 'react-hook-form';
import { FormGroup } from '@blueprintjs/core';
import { ErrorMessage } from '@hookform/error-message';
import { ArgumentsOf } from 'common';

interface InputProps {
    id: string;
    disabled?: boolean;
    placeholder?: string;
}

export interface InputWrapperProps {
    name: string;
    label: string;
    disabled?: boolean;
    placeholder?: string;
    defaultValue?: any;
    rules?: React.ComponentProps<typeof Controller>['rules'];
    render: (
        inputProps: InputProps,
        controllerProps: ArgumentsOf<
            React.ComponentPropsWithRef<typeof Controller>['render']
        >[0],
    ) => ReactElement;
}

const InputWrapper: FC<InputWrapperProps> = ({
    name,
    defaultValue,
    label,
    rules,
    render,
    ...rest
}) => {
    const {
        control,
        formState: { errors },
    } = useFormContext();
    const id = `${name}-input`;
    return (
        <FormGroup
            label={label}
            labelFor={id}
            labelInfo={rules?.required ? '(required)' : '(optional)'}
            intent={get(errors, name) ? 'danger' : 'none'}
            helperText={<ErrorMessage errors={errors} name={name} as="p" />}
        >
            <Controller
                control={control}
                name={name}
                rules={rules}
                defaultValue={defaultValue}
                render={(controllerProps) =>
                    render({ id, ...rest }, controllerProps)
                }
            />
        </FormGroup>
    );
};

export default InputWrapper;
