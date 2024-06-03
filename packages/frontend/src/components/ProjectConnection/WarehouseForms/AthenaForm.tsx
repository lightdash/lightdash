import { Anchor, NumberInput, Stack, TextInput } from '@mantine/core';
import type { FC } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useToggle } from 'react-use';
import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';

export const AthenaSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();

    return (
        <TextInput
            label="Schema"
            description="This is the schema name."
            required
            {...register('warehouse.schema', {
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            })}
            disabled={disabled}
        />
    );
};
const AthenaForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { register } = useFormContext();

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label="AWS Access Key ID"
                    description={<p>AWS Acces Key ID</p>}
                    {...register('warehouse.awsAccessKey', {
                        validate: {
                            hasNoWhiteSpaces:
                                hasNoWhiteSpaces('AWS Access Key ID'),
                        },
                        setValueAs: (value) =>
                            value === '' ? undefined : value,
                    })}
                    disabled={disabled}
                />

                <TextInput
                    label="AWS Secret Key"
                    description={<p>AWS Secret Key</p>}
                    {...register('warehouse.awsSecretKey', {
                        validate: {
                            hasNoWhiteSpaces:
                                hasNoWhiteSpaces('AWS Access Key ID'),
                        },
                        setValueAs: (value) =>
                            value === '' ? undefined : value,
                    })}
                    disabled={disabled}
                />

                <TextInput
                    label="Region"
                    description={
                        <p>AWS Region where the Athena database is located.</p>
                    }
                    {...register('warehouse.region', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Region'),
                        },
                        setValueAs: (value) =>
                            value === '' ? undefined : value,
                    })}
                    disabled={disabled}
                />

                <TextInput
                    label="Output Location"
                    placeholder="s3://bucket-name/folder-name/"
                    description={<p>Athena Output Location</p>}
                    {...register('warehouse.outputLocation', {
                        validate: {
                            hasNoWhiteSpaces:
                                hasNoWhiteSpaces('Output Location'),
                        },
                        setValueAs: (value) =>
                            value === '' ? undefined : value,
                    })}
                    disabled={disabled}
                />

                <TextInput
                    label="Work Group"
                    placeholder="primary"
                    description={<p>Athena Work Group</p>}
                    {...register('warehouse.workgroup', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Region'),
                        },
                        setValueAs: (value) =>
                            value === '' ? undefined : value,
                    })}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <Controller
                            name="warehouse.maximumBytesBilled"
                            defaultValue={1000000000}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label="Maximum bytes billed"
                                    description={
                                        <p>
                                            When a value is configured, queries
                                            executed by dbt will fail if they
                                            exceed the configured maximum bytes
                                            threshold. You can see more details
                                            in{' '}
                                            <Anchor
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/Athena-profile#maximum-bytes-billed"
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
                            )}
                        />
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
