import { WarehouseTypes } from '@lightdash/common';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FileInput from '../../ReactHookForm/FileInput';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import NumericInput from '../../ReactHookForm/NumericInput';
import SelectField from '../../ReactHookForm/Select';
import {
    AdvancedButton,
    AdvancedButtonWrapper,
} from '../ProjectConnection.styles';
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
                documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#project"
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
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#priority"
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

            <AdvancedButtonWrapper>
                <AdvancedButton
                    icon={isOpen ? 'chevron-up' : 'chevron-down'}
                    text={`Advanced configuration options`}
                    onClick={toggleOpen}
                />
            </AdvancedButtonWrapper>
        </>
    );
};

export default BigQueryForm;
