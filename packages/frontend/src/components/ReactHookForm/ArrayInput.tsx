import { FormGroup, Icon } from '@blueprintjs/core';
import React, { useState } from 'react';
import { Controller, useFieldArray, useFormContext } from 'react-hook-form';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { LabelInfoToggleButton } from './FromGroup.styles';

type Props = {
    name: string;
    label: string;
    disabled?: boolean;
    documentationUrl?: string;
    labelHelp?: string | JSX.Element;
    renderRow: (
        key: string,
        index: number,
        remove: ReturnType<typeof useFieldArray>['remove'],
    ) => JSX.Element;
    renderAppendRowButton: (
        append: ReturnType<typeof useFieldArray>['append'],
    ) => JSX.Element;
};
export const ArrayInput = ({
    name,
    label,
    documentationUrl,
    labelHelp,
    renderRow,
    renderAppendRowButton,
}: Props) => {
    const { control } = useFormContext();
    const { fields, remove, append } = useFieldArray({ name, control });

    const [isLabelInfoOpen, setIsLabelInfoOpen] = useState<boolean>(false);

    return (
        <FormGroup
            className="input-wrapper"
            label={label}
            subLabel={isLabelInfoOpen && labelHelp}
            labelInfo={
                <>
                    <span style={{ flex: 1 }}></span>
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
        >
            {fields.map((field, index) => renderRow(field.id, index, remove))}
            {renderAppendRowButton(append)}
        </FormGroup>
    );
};
