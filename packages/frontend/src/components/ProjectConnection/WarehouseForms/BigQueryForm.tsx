import { Button } from '@blueprintjs/core';
import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FileInput from '../../ReactHookForm/FileInput';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import SelectField from '../../ReactHookForm/Select';
import { useProjectFormContext } from '../ProjectFormProvider';

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <Input
            name="warehouse.dataset"
            label="Data set"
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#data-set"
            rules={{
                required: 'Required field',
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Data set'),
                },
            }}
            disabled={disabled}
        />
    );
};
const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.BIGQUERY;
    return (
        <>
            <Input
                name="warehouse.project"
                label="Project"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#project-1"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Project'),
                    },
                }}
                disabled={disabled}
            />

            <Input
                name="warehouse.location"
                label="Location"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#location"
                rules={{
                    required: 'Required field',
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Location'),
                    },
                }}
                disabled={disabled}
            />
            <FileInput
                name="warehouse.keyfileContents"
                label="Key File"
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#key-file"
                rules={{
                    required: requireSecrets ? 'Required field' : undefined,
                }}
                fileInputProps={{
                    text: !requireSecrets ? '**************' : undefined,
                }}
                acceptedTypes="application/json"
                disabled={disabled}
            />
            <FormSection isOpen={isOpen} name="advanced">
                <NumericInput
                    name="warehouse.timeoutSeconds"
                    label="Timeout in seconds"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#timeout-in-seconds"
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={300}
                />
                <SelectField
                    name="warehouse.priority"
                    label="Priority"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#timeout-in-seconds"
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
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#retries"
                    rules={{
                        required: 'Required field',
                    }}
                    defaultValue={3}
                />
                <NumericInput
                    name="warehouse.maximumBytesBilled"
                    label="Maximum bytes billed"
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#maximum-bytes-billed"
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
