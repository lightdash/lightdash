import { AthenaAuthenticationType, WarehouseTypes } from '@lightdash/common';
import {
    TextInput,
    Stack,
    Anchor,
    Select,
    PasswordInput,
    ActionIcon,
    Tooltip,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, type FC, type ReactNode } from 'react';
import { useToggle } from 'react-use';
import useHealth from '../../../hooks/health/useHealth';
import MantineIcon from '../../common/MantineIcon';
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import { useCreateAwsWebIdentityAudience } from './awsWebIdentityHooks';
import { AthenaDefaultValues } from './defaultValues';

export const AthenaSchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description={
                description ?? 'This is the schema name (database in Athena).'
            }
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
    const health = useHealth();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.ATHENA;
    const form = useFormContext();

    const warehouse = form.values.warehouse;

    if (warehouse?.type !== WarehouseTypes.ATHENA) {
        throw new Error('Athena form is not used for this warehouse type');
    }

    const isIamRoleAuthEnabled =
        health.data?.isAthenaWarehouseIamRoleAuthEnabled ?? false;
    const isWebIdentityAuthEnabled =
        health.data?.isAthenaWarehouseWebIdentityAuthEnabled ?? false;
    const enabledAuthenticationTypes = [
        AthenaAuthenticationType.ACCESS_KEY,
        ...(isIamRoleAuthEnabled ? [AthenaAuthenticationType.IAM_ROLE] : []),
        ...(isWebIdentityAuthEnabled
            ? [AthenaAuthenticationType.WEB_IDENTITY]
            : []),
    ];
    const isAuthenticationTypeEnabled = (
        type: AthenaAuthenticationType | undefined,
    ): type is AthenaAuthenticationType =>
        type !== undefined && enabledAuthenticationTypes.includes(type);

    const savedAuthenticationType =
        savedProject?.warehouseConnection?.type === WarehouseTypes.ATHENA
            ? savedProject.warehouseConnection.authenticationType
            : undefined;

    const defaultAuthenticationType =
        savedAuthenticationType ?? AthenaAuthenticationType.ACCESS_KEY;

    const fallbackAuthenticationType = isAuthenticationTypeEnabled(
        defaultAuthenticationType,
    )
        ? defaultAuthenticationType
        : AthenaAuthenticationType.ACCESS_KEY;

    const isCurrentTypeEnabled = isAuthenticationTypeEnabled(
        warehouse.authenticationType,
    );
    const hasHealth = !!health.data;

    useEffect(() => {
        // Wait for health so a saved type isn't reset before it is known.
        if (hasHealth && !isCurrentTypeEnabled) {
            form.setFieldValue(
                'warehouse.authenticationType',
                fallbackAuthenticationType,
            );
        }
    }, [hasHealth, isCurrentTypeEnabled, fallbackAuthenticationType, form]);

    const authenticationType = isAuthenticationTypeEnabled(
        warehouse.authenticationType,
    )
        ? warehouse.authenticationType
        : fallbackAuthenticationType;

    const isAccessKeyAuthentication =
        authenticationType === AthenaAuthenticationType.ACCESS_KEY;
    const isWebIdentityAuthentication =
        authenticationType === AthenaAuthenticationType.WEB_IDENTITY;

    const createAudience = useCreateAwsWebIdentityAudience({
        onSuccess: ({ audience }) => {
            form.setFieldValue('warehouse.webIdentityAudience', audience);
        },
    });
    const { mutate: generateAudience, isLoading: isGeneratingAudience } =
        createAudience;
    const hasAudience = !!warehouse.webIdentityAudience;

    useEffect(() => {
        if (
            isWebIdentityAuthentication &&
            !hasAudience &&
            !disabled &&
            !isGeneratingAudience &&
            !createAudience.isError
        ) {
            generateAudience();
        }
    }, [
        isWebIdentityAuthentication,
        hasAudience,
        disabled,
        isGeneratingAudience,
        createAudience.isError,
        generateAudience,
    ]);

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
                                inherit
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
                {enabledAuthenticationTypes.length > 1 && (
                    <Select
                        allowDeselect={false}
                        name="warehouse.authenticationType"
                        label="Authentication Type"
                        description="Choose how Lightdash authenticates to AWS."
                        data={[
                            {
                                value: AthenaAuthenticationType.ACCESS_KEY,
                                label: 'Access Keys',
                            },
                            ...(isIamRoleAuthEnabled
                                ? [
                                      {
                                          value: AthenaAuthenticationType.IAM_ROLE,
                                          label: 'IAM Role',
                                      },
                                  ]
                                : []),
                            ...(isWebIdentityAuthEnabled
                                ? [
                                      {
                                          value: AthenaAuthenticationType.WEB_IDENTITY,
                                          label: 'Lightdash identity (no keys)',
                                      },
                                  ]
                                : []),
                        ]}
                        defaultValue={fallbackAuthenticationType}
                        {...form.getInputProps('warehouse.authenticationType')}
                        required
                        disabled={disabled}
                    />
                )}
                {isAccessKeyAuthentication && (
                    <>
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
                    </>
                )}

                {isWebIdentityAuthentication && (
                    <>
                        <TextInput
                            name="warehouse.assumeRoleArn"
                            label="IAM Role ARN"
                            description="The role Lightdash assumes. Its trust policy must allow accounts.google.com with the audience below."
                            required
                            {...form.getInputProps('warehouse.assumeRoleArn')}
                            placeholder="arn:aws:iam::123456789012:role/lightdash-athena"
                            disabled={disabled}
                        />
                        <TextInput
                            label="Audience"
                            description="Use this as accounts.google.com:oaud in the role's trust policy. Lightdash support gives you the subject. A new audience stops this connection until you update the trust policy."
                            value={warehouse.webIdentityAudience ?? ''}
                            placeholder={
                                isGeneratingAudience ? 'Generating…' : undefined
                            }
                            readOnly
                            rightSection={
                                <Tooltip label="Generate new audience">
                                    <ActionIcon
                                        variant="subtle"
                                        loading={isGeneratingAudience}
                                        disabled={disabled}
                                        onClick={() => generateAudience()}
                                        aria-label="Generate new audience"
                                    >
                                        <MantineIcon icon={IconRefresh} />
                                    </ActionIcon>
                                </Tooltip>
                            }
                        />
                    </>
                )}

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack mt="sm">
                        {!isWebIdentityAuthentication && (
                            <>
                                <TextInput
                                    name="warehouse.assumeRoleArn"
                                    label="Assume Role ARN"
                                    description="Optional IAM role ARN to assume after authenticating. Works with any authentication type."
                                    {...form.getInputProps(
                                        'warehouse.assumeRoleArn',
                                    )}
                                    placeholder="arn:aws:iam::123456789012:role/my-athena-role"
                                    disabled={disabled}
                                />
                                <TextInput
                                    name="warehouse.assumeRoleExternalId"
                                    label="Assume Role External ID"
                                    description="Optional external ID for the assume role trust policy."
                                    {...form.getInputProps(
                                        'warehouse.assumeRoleExternalId',
                                    )}
                                    disabled={disabled}
                                />
                            </>
                        )}
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
