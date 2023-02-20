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
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <Input
            name="warehouse.dataset"
            label="Data set"
            labelHelp={
                <p>
                    This is the name of your dbt dataset: the dataset in your
                    warehouse where the output of your dbt models is written to.
                    If you're not sure what this is, check out the
                    <b> dataset </b>
                    value{' '}
                    <a
                        target="_blank"
                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#:~:text=This%20connection%20method%20requires%20local%20OAuth%20via%20gcloud."
                        rel="noreferrer"
                    >
                        you've set in your dbt <b>profiles.yml</b> file
                    </a>
                    .
                </p>
            }
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
                labelHelp="This is the GCP project ID."
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
                labelHelp={
                    <p>
                        The location of BigQuery datasets. You can see more
                        details in{' '}
                        <a
                            target="_blank"
                            href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#dataset-locations"
                            rel="noreferrer"
                        >
                            dbt documentation
                        </a>
                        .
                    </p>
                }
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
                labelHelp={
                    <p>
                        This is the JSON key file. You can see{' '}
                        <a
                            target="_blank"
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#key-file"
                            rel="noreferrer"
                        >
                            how to create a key here
                        </a>
                        .
                    </p>
                }
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
                    labelHelp={
                        <p>
                            If a dbt model takes longer than this timeout to
                            complete, then BigQuery may cancel the query. You
                            can see more details in{' '}
                            <a
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#timeouts"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </a>
                            .
                        </p>
                    }
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={300}
                />
                <SelectField
                    name="warehouse.priority"
                    label="Priority"
                    labelHelp={
                        <p>
                            The priority for the BigQuery jobs that dbt
                            executes. You can see more details in{' '}
                            <a
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#priority"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </a>
                            .
                        </p>
                    }
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
                    labelHelp={
                        <p>
                            The number of times dbt should retry queries that
                            result in unhandled server errors You can see more
                            details in{' '}
                            <a
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#retries"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </a>
                            .
                        </p>
                    }
                    rules={{
                        required: 'Required field',
                    }}
                    defaultValue={3}
                />
                <NumericInput
                    name="warehouse.maximumBytesBilled"
                    label="Maximum bytes billed"
                    labelHelp={
                        <p>
                            When a value is configured, queries executed by dbt
                            will fail if they exceed the configured maximum
                            bytes threshold. You can see more details in{' '}
                            <a
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#maximum-bytes-billed"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </a>
                            .
                        </p>
                    }
                    rules={{
                        required: 'Required field',
                    }}
                    disabled={disabled}
                    defaultValue={1000000000}
                />
                <StartOfWeekSelect disabled={disabled} />
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
