import { Button, FormGroup, Icon } from '@blueprintjs/core';
import { useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { LabelInfoToggleButton } from './FromGroup.styles';
import Input from './Input';
import { MultiKeyValuePairRow } from './MultiKeyValuePairsInput.styles';

type Props = {
    name: string;
    label: string;
    disabled?: boolean;
    documentationUrl?: string;
    labelHelp?: string | JSX.Element;
};
export const MultiKeyValuePairsInput = ({
    name,
    label,
    disabled,
    documentationUrl,
    labelHelp,
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
            {fields.map((field, index) => (
                <MultiKeyValuePairRow key={field.id}>
                    <Input
                        name={`${name}.${index}.key`}
                        placeholder="Key"
                        disabled={disabled}
                    />
                    <Input
                        name={`${name}.${index}.value`}
                        placeholder="Value"
                        disabled={disabled}
                    />
                    <Button
                        minimal={true}
                        icon={'cross'}
                        onClick={() => remove(index)}
                        disabled={disabled}
                    />
                </MultiKeyValuePairRow>
            ))}
            <Button
                minimal
                onClick={() => append({ key: '', value: '' })}
                icon={'plus'}
                text="Add variable"
                disabled={disabled}
            />
        </FormGroup>
    );
};
