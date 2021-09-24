import React, { FC } from 'react';
import { Button } from '@blueprintjs/core';
import { useToggle } from 'react-use';
import Input from '../../ReactHookForm/Input';
import SelectField from '../../ReactHookForm/Select';
import FileInput from '../../ReactHookForm/FileInput';
import FormSection from '../../ReactHookForm/FormSection';
import NumericInput from '../../ReactHookForm/NumericInput';

const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <>
            <Input
                name="warehouse.project"
                label="Project"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.dataset"
                label="Data set"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <Input
                name="warehouse.location"
                label="Location"
                rules={{
                    required: 'Required field',
                }}
                disabled={disabled}
            />
            <FileInput
                name="warehouse.keyfileContents"
                label="Key File"
                rules={{
                    required: 'Required field',
                }}
                acceptedTypes="application/json"
                disabled={disabled}
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="warehouse.threads"
                    label="Threads"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={1}
                />
                <NumericInput
                    name="warehouse.timeoutSeconds"
                    label="Timeout in seconds"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={300}
                />
                <SelectField
                    name="warehouse.priority"
                    label="Priority"
                    options={[
                        {
                            value: 'interactive',
                            label: 'interactive',
                        },
                        {
                            value: 'batch',
                            label: 'batch',
                        },
                    ]}
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue="interactive"
                />
                <NumericInput
                    name="warehouse.retries"
                    label="Retries"
                    rules={{
                        required: 'Required field',
                    }}
                    defaultValue={3}
                />
                <NumericInput
                    name="warehouse.maximumBytesBilled"
                    label="Maximum bytes billed"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={1000000000}
                />
            </FormSection>

            <div
                style={{
                    display: 'flex',
                    marginTop: 20,
                    justifyContent: 'flex-end',
                }}
            >
                <Button
                    minimal
                    text={`${isOpen ? 'Hide' : 'Show'} advanced fields`}
                    onClick={toggleOpen}
                    style={{
                        marginRight: 10,
                    }}
                />
            </div>
        </>
    );
};

export default BigQueryForm;
