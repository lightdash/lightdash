import React, { FC } from 'react';
import { Button, Intent } from '@blueprintjs/core';
import {
    WarehouseTypes,
    CreateBigqueryCredentials,
    BigqueryCredentials,
} from 'common';
import { DefaultValues } from 'react-hook-form/dist/types/form';
import { useToggle } from 'react-use';
import Form from '../ReactHookForm/Form';
import Input from '../ReactHookForm/Input';
import SelectField from '../ReactHookForm/Select';
import FileInput from '../ReactHookForm/FileInput';
import FormSection from '../ReactHookForm/FormSection';
import NumericInput from '../ReactHookForm/NumericInput';

const defaultValues: DefaultValues<CreateBigqueryCredentials> = {
    type: WarehouseTypes.BIGQUERY,
    project: '',
    dataset: '',
    threads: 1,
    timeoutSeconds: 300,
    priority: 'interactive',
    keyfileContents: undefined,
    retries: 3,
    location: '',
    maximumBytesBilled: 1000000000,
};

const BigQueryForm: FC<{
    values?: BigqueryCredentials;
    loading: boolean;
    onSave: (data: CreateBigqueryCredentials) => void;
}> = ({ values = defaultValues, loading, onSave }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    return (
        <Form<CreateBigqueryCredentials>
            defaultValues={values}
            disabled={loading}
            onSubmit={onSave}
        >
            <Input
                name="project"
                label="Project"
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                name="dataset"
                label="Data set"
                rules={{
                    required: 'Required field',
                }}
            />
            <Input
                name="location"
                label="Location"
                rules={{
                    required: 'Required field',
                }}
            />
            <FileInput
                name="keyfileContents"
                label="Key File"
                rules={{
                    required: 'Required field',
                }}
                acceptedTypes="application/json"
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="threads"
                    label="Threads"
                    rules={{
                        required: 'Required field',
                    }}
                />
                <NumericInput
                    name="timeoutSeconds"
                    label="Timeout in seconds"
                    rules={{
                        required: 'Required field',
                    }}
                />
                <SelectField
                    name="priority"
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
                />
                <NumericInput
                    name="retries"
                    label="Retries"
                    rules={{
                        required: 'Required field',
                    }}
                />
                <NumericInput
                    name="maximumBytesBilled"
                    label="Maximum bytes billed"
                    rules={{
                        required: 'Required field',
                    }}
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
                <Button
                    type="submit"
                    intent={Intent.PRIMARY}
                    text="Save"
                    loading={loading}
                />
            </div>
        </Form>
    );
};

export default BigQueryForm;
