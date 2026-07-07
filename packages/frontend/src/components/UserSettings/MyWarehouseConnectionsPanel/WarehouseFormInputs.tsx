import {
    RedshiftAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
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
import { type FC, useEffect, useState } from 'react';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import { useDatabricksLoginPopup } from '../../../hooks/useDatabricks';
import { useProject } from '../../../hooks/useProject';
import { useRedshiftAwsSsoLoginPopup } from '../../../hooks/useRedshiftAwsSso';
import { useSnowflakeLoginPopup } from '../../../hooks/useSnowflake';
import MantineIcon from '../../common/MantineIcon';
import { getSsoLabel } from '../../ProjectConnection/WarehouseForms/util';
import { WarehouseSsoButton } from './WarehouseSsoButton';

const BigQueryFormInput: FC<{ onClose: () => void }> = ({ onClose }) => {
    const { mutate: openLoginPopup } = useGoogleLoginPopup('bigquery', onClose);

    // If this popup happens, it means we don't have warehouse credentials,
    // (aka isAuthenticated is false), so we need to authenticate
    return (
        <WarehouseSsoButton
            warehouseType={WarehouseTypes.BIGQUERY}
            providerName="Google"
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
        <WarehouseSsoButton
            warehouseType={WarehouseTypes.SNOWFLAKE}
            providerName="Snowflake"
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
        <WarehouseSsoButton
            warehouseType={WarehouseTypes.DATABRICKS}
            providerName="Databricks"
            disabled={false}
            openLoginPopup={openLoginPopup}
        />
    );
};

const RedshiftIamFormInputs: FC<{
    disabled: boolean;
    form: UseFormReturnType<UpsertUserWarehouseCredentials>;
    onClose: () => void;
    onSuccess?: (data: UserWarehouseCredentials) => void;
    projectUuid?: string;
    projectName?: string;
    isAwsSsoConfigured?: boolean;
}> = ({
    disabled,
    form,
    onClose,
    onSuccess,
    projectUuid,
    projectName,
    isAwsSsoConfigured,
}) => {
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
    const isBrowserIamAuthentication =
        redshiftCredentials !== undefined &&
        'authenticationType' in redshiftCredentials &&
        redshiftCredentials.authenticationType ===
            RedshiftAuthenticationType.IAM_BROWSER;
    const { mutate: openAwsSsoLogin, isLoading: isAwsSsoLoading } =
        useRedshiftAwsSsoLoginPopup({
            onLogin: async (credentials) => {
                onSuccess?.(credentials);
                onClose();
            },
        });
    const isAwsSsoDisabled =
        disabled || isAwsSsoLoading || !projectUuid || !isAwsSsoConfigured;

    if (isBrowserIamAuthentication) {
        return (
            <Stack gap="xs">
                <WarehouseSsoButton
                    warehouseType={WarehouseTypes.REDSHIFT}
                    providerName="AWS"
                    disabled={isAwsSsoDisabled}
                    disabledTooltip={
                        !projectUuid
                            ? 'Open this from a Redshift project to sign in with AWS'
                            : !isAwsSsoConfigured
                              ? 'Ask an admin to configure AWS IAM Identity Center on the Redshift project connection'
                              : undefined
                    }
                    loading={isAwsSsoLoading}
                    openLoginPopup={() => {
                        openAwsSsoLogin({
                            projectUuid,
                            projectName,
                            databaseUser: redshiftCredentials?.user,
                        });
                    }}
                />

                {!projectUuid && (
                    <Text fz="xs" c="dimmed">
                        Browser sign-in is available from a project that has AWS
                        IAM Identity Center configured.
                    </Text>
                )}
                {projectUuid && !isAwsSsoConfigured && (
                    <Text fz="xs" c="dimmed">
                        Ask an admin to configure AWS IAM Identity Center on the
                        Redshift project connection.
                    </Text>
                )}

                <TextInput
                    size="xs"
                    label="Database user"
                    description="Optional. Leave blank to use the IAM identity as the Redshift database user."
                    disabled={disabled}
                    {...form.getInputProps('credentials.user')}
                />
            </Stack>
        );
    }

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
                type="button"
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
    onSuccess?: (data: UserWarehouseCredentials) => void;
    projectUuid?: string;
    projectName?: string;
    databricksCredentialsName?: string;
}> = ({
    form,
    disabled,
    onClose,
    onSuccess,
    projectUuid,
    projectName,
    databricksCredentialsName,
}) => {
    const { data: project } = useProject(projectUuid, {
        enabled:
            form.values.credentials.type === WarehouseTypes.REDSHIFT &&
            !!projectUuid,
    });
    const redshiftProjectCredentials =
        project?.warehouseConnection?.type === WarehouseTypes.REDSHIFT
            ? project.warehouseConnection
            : undefined;
    const isProjectBrowserIamAuthentication =
        redshiftProjectCredentials?.authenticationType ===
        RedshiftAuthenticationType.IAM_BROWSER;
    const isAwsSsoConfigured =
        !!redshiftProjectCredentials?.awsSsoStartUrl &&
        !!redshiftProjectCredentials.awsSsoRegion &&
        !!redshiftProjectCredentials.awsSsoAccountId &&
        !!redshiftProjectCredentials.awsSsoRoleName;
    const redshiftAuthenticationType = isProjectBrowserIamAuthentication
        ? RedshiftAuthenticationType.IAM_BROWSER
        : form.values.credentials.type === WarehouseTypes.REDSHIFT
          ? 'authenticationType' in form.values.credentials
              ? (form.values.credentials.authenticationType ??
                RedshiftAuthenticationType.PASSWORD)
              : RedshiftAuthenticationType.PASSWORD
          : undefined;

    useEffect(() => {
        if (
            isProjectBrowserIamAuthentication &&
            form.values.credentials.type === WarehouseTypes.REDSHIFT &&
            'authenticationType' in form.values.credentials &&
            form.values.credentials.authenticationType !==
                RedshiftAuthenticationType.IAM_BROWSER
        ) {
            form.setFieldValue(
                'credentials.authenticationType',
                RedshiftAuthenticationType.IAM_BROWSER,
            );
        }
    }, [form, isProjectBrowserIamAuthentication]);

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
                    {!isProjectBrowserIamAuthentication && (
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
                                    label: 'AWS IAM (CLI credentials)',
                                },
                                {
                                    value: RedshiftAuthenticationType.IAM_BROWSER,
                                    label: getSsoLabel(
                                        WarehouseTypes.REDSHIFT,
                                        'AWS',
                                    ),
                                },
                            ]}
                            disabled={disabled}
                            {...form.getInputProps(
                                'credentials.authenticationType',
                            )}
                        />
                    )}

                    {redshiftAuthenticationType ===
                        RedshiftAuthenticationType.IAM ||
                    redshiftAuthenticationType ===
                        RedshiftAuthenticationType.IAM_BROWSER ? (
                        <RedshiftIamFormInputs
                            disabled={disabled}
                            form={form}
                            onClose={onClose}
                            onSuccess={onSuccess}
                            projectUuid={projectUuid}
                            projectName={projectName}
                            isAwsSsoConfigured={isAwsSsoConfigured}
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
