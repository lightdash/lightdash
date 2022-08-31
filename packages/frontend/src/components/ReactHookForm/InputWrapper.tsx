import { FormGroup, Icon } from '@blueprintjs/core';
import { ErrorMessage } from '@hookform/error-message';
import { ArgumentsOf } from '@lightdash/common';
import React, { FC, ReactElement, useState } from 'react';
import { Controller, get, useFormContext } from 'react-hook-form';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { LabelInfoToggleButton } from './FromGroup.styles';
import './InputWrapper.css';

interface InputProps {
    id: string;
    disabled?: boolean;
    placeholder?: string;
}

export interface InputWrapperProps {
    name: string;
    label?: string;
    disabled?: boolean;
    placeholder?: string;
    defaultValue?: any;
    documentationUrl?: string;
    className?: string;
    labelHelp?: string | JSX.Element;
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
    documentationUrl,
    label,
    rules,
    render,
    className,
    labelHelp,
    ...rest
}) => {
    const {
        control,
        formState: { errors },
    } = useFormContext();
    const id = `${name}-input`;
    const requiredLabel = rules?.required ? '*' : '';

    const [isLabelInfoOpen, setIsLabelInfoOpen] = useState<boolean>(false);

    return (
        <FormGroup
            className={`input-wrapper ${className}`}
            label={label}
            labelFor={id}
            subLabel={isLabelInfoOpen && labelHelp}
            labelInfo={
                <>
                    <span style={{ flex: 1 }}>{requiredLabel}</span>
                    {documentationUrl && !labelHelp && (
                        <DocumentationHelpButton url={documentationUrl} />
                    )}
                    {labelHelp && (
                        <LabelInfoToggleButton
                            onClick={(e) => {
                                e.preventDefault();
                                setIsLabelInfoOpen(!isLabelInfoOpen);
                            }}
                        >
                            <Icon icon="help" intent="none" iconSize={15} />
                        </LabelInfoToggleButton>
                    )}
                </>
            }
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
