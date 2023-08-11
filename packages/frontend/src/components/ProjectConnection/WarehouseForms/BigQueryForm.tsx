import {
    Accordion,
    Anchor,
    FileInput,
    NumberInput,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { FC } from 'react';
import { useToggle } from 'react-use';
import FormSection from '../../ReactHookForm/FormSection';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <TextInput
            name="warehouse.dataset"
            label="Data set"
            description={
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
            required
            disabled={disabled}
        />
    );
};
const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.project"
                    label="Project"
                    description="This is the GCP project ID."
                    required
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
                    required
                    disabled={disabled}
                />
                <FileInput
                    name="warehouse.keyfileContents"
                    label="Key File"
                    placeholder="Choose file..."
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
                    required
                    accept="application/json"
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            label="Timeout in seconds"
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
                            defaultValue={300}
                        />
                        <Select
                            name="warehouse.priority"
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
                            defaultValue="interactive"
                        />
                        <NumberInput
                            name="warehouse.retries"
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
                            defaultValue={3}
                        />
                        <NumberInput
                            name="warehouse.maximumBytesBilled"
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
                            defaultValue={1000000000}
                        />
                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>

                <Accordion
                    chevronPosition="left"
                    variant="filled"
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <Accordion.Item value="advanced configuration options">
                        <Accordion.Control
                            onClick={toggleOpen}
                            style={{
                                fontSize: '14px',
                                paddingRight: '2px',
                            }}
                        >
                            Advanced configuration options
                        </Accordion.Control>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </>
    );
};

export default BigQueryForm;
