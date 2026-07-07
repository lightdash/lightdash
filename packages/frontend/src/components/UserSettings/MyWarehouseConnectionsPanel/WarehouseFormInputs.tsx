import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Code,
    Collapse,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronRight,
    IconInfoCircle,
} from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import { useDatabricksLoginPopup } from '../../../hooks/useDatabricks';
import { useSnowflakeLoginPopup } from '../../../hooks/useSnowflake';
import MantineIcon from '../../common/MantineIcon';
import { BigQuerySSOInput } from '../../ProjectConnection/WarehouseForms/BigQueryForm';
import { DatabricksSSOInput } from '../../ProjectConnection/WarehouseForms/DatabricksForm';
import { SnowflakeSSOInput } from '../../ProjectConnection/WarehouseForms/SnowflakeForm';

const BigQueryFormInput: FC<{ onClose: () => void }> = ({ onClose }) => {
    const { mutate: openLoginPopup } = useGoogleLoginPopup('bigquery', onClose);

    // If this popup happens, it means we don't have warehouse credentials,
    // (aka isAuthenticated is false), so we need to authenticate
    return (
        <BigQuerySSOInput
            isAuthenticated={false}
            disabled={false}
            openLoginPopup={openLoginPopup}
        />
    );
};

export const SnowflakeFormInput: FC<{ onClose: () => void }> = ({
    onClose,
}) => {
    const { mutate: openLoginPopup } = useSnowflakeLoginPopup({
        onLogin: async () => {
            onClose();
        },
    });

    // If this popup happens, it means we don't have warehouse credentials,
    // (aka isAuthenticated is false), so we need to authenticate
    return (
        <SnowflakeSSOInput
            isAuthenticated={false}
            disabled={false}
            openLoginPopup={openLoginPopup}
        />
    );
};

const DatabricksFormInput: FC<{
    onClose: () => void;
    projectUuid?: string;
    projectName?: string;
    credentialsName?: string;
}> = ({ onClose, projectUuid, projectName, credentialsName }) => {
    const { mutate: openLoginPopup } = useDatabricksLoginPopup({
        onLogin: async () => {
            onClose();
        },
        projectUuid,
        projectName,
        credentialsName,
    });

    // If this popup happens, it means we don't have warehouse credentials,
    // (aka isAuthenticated is false), so we need to authenticate
    return (
        <DatabricksSSOInput
            isAuthenticated={false}
            disabled={false}
            openLoginPopup={openLoginPopup}
        />
    );
};

const RedshiftIamFormInputs: FC<{
    disabled: boolean;
    form: UseFormReturnType<UpsertUserWarehouseCredentials>;
}> = ({ disabled, form }) => {
    const redshiftCredentials =
        form.values.credentials.type === WarehouseTypes.REDSHIFT
            ? form.values.credentials
            : undefined;
    const hasAdvancedIamOptions =
        redshiftCredentials !== undefined &&
        'assumeRoleArn' in redshiftCredentials &&
        (!!redshiftCredentials.assumeRoleArn ||
            !!redshiftCredentials.assumeRoleExternalId);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(
        !!redshiftCredentials?.user || hasAdvancedIamOptions,
    );

    return (
        <Stack gap="xs">
            <Alert
                color="blue"
                icon={<MantineIcon icon={IconInfoCircle} size="lg" />}
            >
                <Stack gap="xxs">
                    <Text fz="xs">
                        Paste temporary AWS credentials generated from your
                        terminal. For AWS SSO, log in first, then export the
                        credentials.
                    </Text>
                    <Code fz="xs">
                        aws configure export-credentials --format env-no-export
                    </Code>
                    <Text fz="xs">
                        For a named SSO profile, add{' '}
                        <Code fz="xs">--profile your-profile</Code>.
                    </Text>
                    <Text fz="xs">
                        Or use the advanced options to provide an IAM role that
                        Lightdash can assume.
                    </Text>
                </Stack>
            </Alert>

            <TextInput
                withAsterisk
                size="xs"
                label="AWS access key ID"
                description="Paste AWS_ACCESS_KEY_ID from the export command."
                disabled={disabled}
                {...form.getInputProps('credentials.accessKeyId')}
            />
            <PasswordInput
                withAsterisk
                size="xs"
                label="AWS secret access key"
                description="Paste AWS_SECRET_ACCESS_KEY from the export command."
                disabled={disabled}
                {...form.getInputProps('credentials.secretAccessKey')}
            />
            <PasswordInput
                size="xs"
                label="AWS session token"
                description="Paste AWS_SESSION_TOKEN. Required for AWS SSO and temporary credentials."
                disabled={disabled}
                {...form.getInputProps('credentials.sessionToken')}
            />

            <Button
                size="compact-xs"
                variant="subtle"
                color="gray"
                leftSection={
                    <MantineIcon
                        icon={
                            isAdvancedOpen ? IconChevronDown : IconChevronRight
                        }
                    />
                }
                onClick={() => setIsAdvancedOpen((isOpen) => !isOpen)}
            >
                Advanced IAM options
            </Button>

            <Collapse in={isAdvancedOpen}>
                <Stack gap="xs">
                    <TextInput
                        size="xs"
                        label="Database user"
                        description="Optional. Leave blank to use the IAM identity as the Redshift database user."
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    <TextInput
                        size="xs"
                        label="Assume role ARN"
                        description="Optional. IAM role to assume before requesting Redshift credentials."
                        disabled={disabled}
                        {...form.getInputProps('credentials.assumeRoleArn')}
                    />
                    <TextInput
                        size="xs"
                        label="Assume role external ID"
                        description="Optional. Only required when the IAM role trust policy requires it."
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.assumeRoleExternalId',
                        )}
                    />
                </Stack>
            </Collapse>
        </Stack>
    );
};

export const WarehouseFormInputs: FC<{
    disabled: boolean;
    form: UseFormReturnType<UpsertUserWarehouseCredentials>;
    onClose: () => void;
    projectUuid?: string;
    projectName?: string;
    databricksCredentialsName?: string;
}> = ({
    form,
    disabled,
    onClose,
    projectUuid,
    projectName,
    databricksCredentialsName,
}) => {
    const redshiftAuthenticationType =
        form.values.credentials.type === WarehouseTypes.REDSHIFT
            ? 'authenticationType' in form.values.credentials
                ? (form.values.credentials.authenticationType ??
                  RedshiftAuthenticationType.PASSWORD)
                : RedshiftAuthenticationType.PASSWORD
            : undefined;

    switch (form.values.credentials.type) {
        case WarehouseTypes.SNOWFLAKE:
            return <SnowflakeFormInput onClose={onClose} />;
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
            return (
                <>
                    <TextInput
                        required
                        size="xs"
                        label="Username/email"
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    <PasswordInput
                        required
                        size="xs"
                        label="Password"
                        disabled={disabled}
                        {...form.getInputProps('credentials.password')}
                    />
                </>
            );
        case WarehouseTypes.REDSHIFT:
            return (
                <>
                    <Select
                        required
                        size="xs"
                        label="Authentication type"
                        data={[
                            {
                                value: RedshiftAuthenticationType.PASSWORD,
                                label: 'Username & password',
                            },
                            {
                                value: RedshiftAuthenticationType.IAM,
                                label: 'AWS IAM',
                            },
                        ]}
                        disabled={disabled}
                        {...form.getInputProps(
                            'credentials.authenticationType',
                        )}
                    />

                    {redshiftAuthenticationType ===
                    RedshiftAuthenticationType.IAM ? (
                        <RedshiftIamFormInputs
                            disabled={disabled}
                            form={form}
                        />
                    ) : (
                        <>
                            <TextInput
                                required
                                size="xs"
                                label="Username/email"
                                disabled={disabled}
                                {...form.getInputProps('credentials.user')}
                            />
                            <PasswordInput
                                required
                                size="xs"
                                label="Password"
                                disabled={disabled}
                                {...form.getInputProps('credentials.password')}
                            />
                        </>
                    )}
                </>
            );
        case WarehouseTypes.BIGQUERY:
            return <BigQueryFormInput onClose={onClose} />;
        case WarehouseTypes.DATABRICKS:
            return (
                <DatabricksFormInput
                    onClose={onClose}
                    projectUuid={projectUuid}
                    projectName={projectName}
                    credentialsName={databricksCredentialsName}
                />
            );
        case WarehouseTypes.DUCKDB:
            return (
                <PasswordInput
                    size="xs"
                    label="MotherDuck access token"
                    description="Create an access token in MotherDuck Settings."
                    disabled={disabled}
                    {...form.getInputProps('credentials.token')}
                />
            );
        default:
            return null;
    }
};
