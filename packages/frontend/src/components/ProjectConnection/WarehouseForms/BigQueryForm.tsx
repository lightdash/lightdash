import { WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    FileInput,
    NumberInput,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { useEffect, useState, type ChangeEvent, type FC } from 'react';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection'; // TODO :: move
import Input from '../../ReactHookForm/Input'; // TODO :: move
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
import { BigQueryDefaultValues } from './defaults';
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
                    <Anchor
                        target="_blank"
                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#:~:text=This%20connection%20method%20requires%20local%20OAuth%20via%20gcloud."
                        rel="noreferrer"
                    >
                        you've set in your dbt <b>profiles.yml</b> file
                    </Anchor>
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
    const form = useFormContext();
    const [temporaryFile, setTemporaryFile] = useState<File | null>(null);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.BIGQUERY;

    const locationField = form.getInputProps('warehouse.location');
    const executionProjectField = form.getInputProps(
        'warehouse.executionProject',
    );
    const onChangeFactory =
        (onChange: (value: string | undefined) => void) =>
        (e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value === '' ? undefined : e.target.value);
        };

    console.log(
        'err',
        form.errors,
        form.getInputProps('warehouse.keyfileContents', { withError: true })
            .error,
    );

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.project"
                    label="Project"
                    description="This is the GCP project ID."
                    required
                    {...form.getInputProps('warehouse.project')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />

                <TextInput
                    name="warehouse.location"
                    label="Location"
                    description={
                        <p>
                            The location of BigQuery datasets. You can see more
                            details in{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#dataset-locations"
                                rel="noreferrer"
                            >
                                dbt documentation
                            </Anchor>
                            .
                        </p>
                    }
                    {...locationField}
                    onChange={onChangeFactory(locationField.onChange)}
                    disabled={disabled}
                />

                <FileInput
                    name="warehouse.keyfileContents"
                    {...form.getInputProps('warehouse.keyfileContents', {
                        withError: true,
                    })}
                    label="Key File"
                    // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                    // @ts-ignore
                    placeholder={
                        !requireSecrets ? '**************' : 'Choose file...'
                    }
                    description={
                        <p>
                            This is the JSON key file. You can see{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#key-file"
                                rel="noreferrer"
                            >
                                how to create a key here
                            </Anchor>
                            .
                        </p>
                    }
                    required={requireSecrets}
                    accept="application/json"
                    value={temporaryFile}
                    onChange={(file) => {
                        if (!file) {
                            form.setFieldValue(
                                'warehouse.keyfileContents',
                                null,
                            );
                            return;
                        }

                        const fileReader = new FileReader();
                        fileReader.onload = function (event) {
                            const contents = event.target?.result;
                            console.log('contents', contents);
                            if (typeof contents === 'string') {
                                try {
                                    setTemporaryFile(file);
                                    form.setFieldValue(
                                        'warehouse.keyfileContents',
                                        JSON.parse(contents),
                                    );
                                } catch (error) {
                                    // 🤷‍♂️
                                    setTimeout(() => {
                                        form.setFieldError(
                                            'warehouse.keyfileContents',
                                            'Invalid JSON file',
                                        );
                                    });

                                    form.setFieldValue(
                                        'warehouse.keyfileContents',
                                        null,
                                    );
                                }
                            } else {
                                form.setFieldValue(
                                    'warehouse.keyfileContents',
                                    null,
                                );
                                setTemporaryFile(null);
                            }
                        };
                        fileReader.readAsText(file);
                    }}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <TextInput
                            name="warehouse.executionProject"
                            label="Execution project"
                            description={
                                <p>
                                    You may specify a project to bill for query
                                    execution, instead of the project/database
                                    where you materialize most resources. You
                                    can see more details in{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup#execution-project"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            {...executionProjectField}
                            onChange={onChangeFactory(
                                executionProjectField.onChange,
                            )}
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label="Timeout in seconds"
                            defaultValue={BigQueryDefaultValues.timeoutSeconds}
                            description={
                                <p>
                                    If a dbt model takes longer than this
                                    timeout to complete, then BigQuery may
                                    cancel the query. You can see more details
                                    in{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#timeouts"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <Select
                            name="warehouse.priority"
                            {...form.getInputProps('warehouse.priority')}
                            defaultValue={BigQueryDefaultValues.priority}
                            label="Priority"
                            description={
                                <p>
                                    The priority for the BigQuery jobs that dbt
                                    executes. You can see more details in{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#priority"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            data={[
                                {
                                    value: 'interactive',
                                    label: 'interactive',
                                },
                                {
                                    value: 'batch',
                                    label: 'batch',
                                },
                            ]}
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.retries"
                            {...form.getInputProps('warehouse.retries')}
                            defaultValue={BigQueryDefaultValues.retries}
                            label="Retries"
                            description={
                                <p>
                                    The number of times dbt should retry queries
                                    that result in unhandled server errors You
                                    can see more details in{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#retries"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            required
                        />

                        <NumberInput
                            name="warehouse.maximumBytesBilled"
                            {...form.getInputProps(
                                'warehouse.maximumBytesBilled',
                            )}
                            defaultValue={
                                BigQueryDefaultValues.maximumBytesBilled
                            }
                            label="Maximum bytes billed"
                            description={
                                <p>
                                    When a value is configured, queries executed
                                    by dbt will fail if they exceed the
                                    configured maximum bytes threshold. You can
                                    see more details in{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#maximum-bytes-billed"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    Advanced configuration options
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default BigQueryForm;
