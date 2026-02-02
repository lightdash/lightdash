import { WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    NumberInput,
    PasswordInput,
    Stack,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import { AthenaDefaultValues } from './defaultValues';

export const AthenaSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="This is the schema name (database in Athena)."
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const AthenaForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.ATHENA;
    const form = useFormContext();

    return (
        <>
            <Stack mt="sm">
                <TextInput
                    name="warehouse.region"
                    label="AWS Region"
                    description={
                        <p>
                            The AWS region where your Athena workgroup is
                            located. See{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.getdbt.com/docs/core/connect-data-platform/athena-setup"
                                rel="noreferrer"
                            >
                                dbt Athena documentation
                            </Anchor>{' '}
                            for more details.
                        </p>
                    }
                    required
                    {...form.getInputProps('warehouse.region')}
                    placeholder="us-east-1"
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.database"
                    label="Catalog"
                    description="This is the Athena data catalog name (typically 'AwsDataCatalog')."
                    required
                    {...form.getInputProps('warehouse.database')}
                    placeholder="AwsDataCatalog"
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.schema"
                    label="Database"
                    description="This is the Athena database name (also known as schema)."
                    required
                    {...form.getInputProps('warehouse.schema')}
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.s3StagingDir"
                    label="S3 Staging Directory"
                    description="S3 location for Athena query results."
                    required
                    {...form.getInputProps('warehouse.s3StagingDir')}
                    placeholder="s3://your-bucket/athena-results/"
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.s3DataDir"
                    label="S3 Data Directory"
                    description="S3 location for storing table data (optional)."
                    {...form.getInputProps('warehouse.s3DataDir')}
                    placeholder="s3://your-bucket/data/"
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.accessKeyId"
                    label="AWS Access Key ID"
                    description="Your AWS access key ID."
                    required
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...form.getInputProps('warehouse.accessKeyId')}
                    disabled={disabled}
                />
                <PasswordInput
                    name="warehouse.secretAccessKey"
                    label="AWS Secret Access Key"
                    description="Your AWS secret access key."
                    required
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...form.getInputProps('warehouse.secretAccessKey')}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack mt="sm">
                        <TextInput
                            name="warehouse.workGroup"
                            label="Workgroup"
                            description="The Athena workgroup to use for queries."
                            {...form.getInputProps('warehouse.workGroup')}
                            placeholder="primary"
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.threads"
                            label="Threads"
                            description="Number of threads for dbt to use."
                            defaultValue={AthenaDefaultValues.threads}
                            {...form.getInputProps('warehouse.threads')}
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.numRetries"
                            label="Number of Retries"
                            description="Number of times to retry failed queries."
                            defaultValue={AthenaDefaultValues.numRetries}
                            {...form.getInputProps('warehouse.numRetries')}
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

export default AthenaForm;
