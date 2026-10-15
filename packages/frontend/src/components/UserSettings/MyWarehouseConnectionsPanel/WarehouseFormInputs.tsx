import {
    DatabricksAuthenticationType,
    RedshiftAuthenticationType,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type UpsertUserWarehouseCredentials,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Code,
    Collapse,
    FileInput,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type UseFormReturnType } from '@mantine/form';
import {
    IconChevronDown,
    IconChevronRight,
    IconInfoCircle,
} from '@tabler/icons-react';
import { type FC, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import { useDatabricksLoginPopup } from '../../../hooks/useDatabricks';
import { useProject } from '../../../hooks/useProject';
import { useRedshiftAwsSsoLoginPopup } from '../../../hooks/useRedshiftAwsSso';
import { getUserWarehouseCredentials } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import { useSnowflakeLoginPopup } from '../../../hooks/useSnowflake';
import MantineIcon from '../../common/MantineIcon';
import {
    getSsoLabel,
    PASSWORD_LABEL,
    PERSONAL_ACCESS_TOKEN_LABEL,
    PRIVATE_KEY_LABEL,
} from '../../ProjectConnection/WarehouseForms/util';
import { PRIVATE_KEY_FIELD_PATH } from './utils';
import { WarehouseSsoButton } from './WarehouseSsoButton';

const BigQueryFormInput: FC<{
    onClose: () => void;
    onSuccess?: (data: UserWarehouseCredentials) => void;
}> = ({ onClose, onSuccess }) => {
    const { mutate: openLoginPopup } = useGoogleLoginPopup(
        'bigquery',
        async () => {
            // The credential is created server-side during the OAuth flow, so
            // fetch it to save the project preference like the form-based path
            try {
                const credentials = await getUserWarehouseCredentials();
                const bigqueryCredential = credentials
                    .filter(
                        ({ credentials: c }) =>
                            c.type === WarehouseTypes.BIGQUERY,
                    )
                    .sort(
                        (a, b) =>
                            new Date(b.createdAt).getTime() -
                            new Date(a.createdAt).getTime(),
                    )[0];
                if (bigqueryCredential) {
                    onSuccess?.(bigqueryCredential);
                }
            } catch {
                // Auth itself succeeded; preference is a best-effort extra
            }
            onClose();
        },
    );

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

export const SnowflakeFormInput: FC<{
    disabled?: boolean;
    form?: UseFormReturnType<UpsertUserWarehouseCredentials>;
    onClose: () => void;
}> = ({ disabled = false, form, onClose }) => {
    const { t } = useTranslation('userSettings');
    const [privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
    const { mutate: openLoginPopup, isSsoEnabled } = useSnowflakeLoginPopup({
        onLogin: async () => {
            onClose();
        },
    });
    const credentials =
        form?.values.credentials.type === WarehouseTypes.SNOWFLAKE
            ? form.values.credentials
            : undefined;
    const authenticationType =
        credentials?.authenticationType ?? SnowflakeAuthenticationType.PASSWORD;
    // Keep SSO listed for a credential already saved as SSO, so an instance
    // that later turned Snowflake OAuth off still labels the stored value
    // instead of rendering an empty select.
    const showSsoOption =
        isSsoEnabled || authenticationType === SnowflakeAuthenticationType.SSO;
    const authenticationOptions = [
        ...(showSsoOption
            ? [
                  {
                      value: SnowflakeAuthenticationType.SSO,
                      label: getSsoLabel(WarehouseTypes.SNOWFLAKE),
                  },
              ]
            : []),
        {
            value: SnowflakeAuthenticationType.PRIVATE_KEY,
            label: PRIVATE_KEY_LABEL,
        },
        {
            value: SnowflakeAuthenticationType.PASSWORD,
            label: PASSWORD_LABEL,
        },
    ];

    if (!form) {
        return (
            <WarehouseSsoButton
                warehouseType={WarehouseTypes.SNOWFLAKE}
                providerName="Snowflake"
                disabled={disabled}
                openLoginPopup={openLoginPopup}
            />
        );
    }

    return (
        <Stack gap="xs">
            <Select
                required
                allowDeselect={false}
                size="xs"
                label={t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.authenticationTypeLabel',
                )}
                data={authenticationOptions}
                value={authenticationType}
                disabled={disabled}
                onChange={(value) => {
                    if (!value || !credentials) return;
                    form.setFieldValue('credentials', {
                        type: WarehouseTypes.SNOWFLAKE,
                        user: credentials.user,
                        authenticationType:
                            value as SnowflakeAuthenticationType,
                    });
                    setPrivateKeyFile(null);
                }}
            />

            {authenticationType === SnowflakeAuthenticationType.SSO ? (
                <WarehouseSsoButton
                    warehouseType={WarehouseTypes.SNOWFLAKE}
                    providerName="Snowflake"
                    disabled={disabled}
                    openLoginPopup={openLoginPopup}
                />
            ) : (
                <>
                    <TextInput
                        required
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.usernameLabel',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    {authenticationType ===
                    SnowflakeAuthenticationType.PRIVATE_KEY ? (
                        <>
                            <FileInput
                                required
                                size="xs"
                                label={t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.privateKeyFileLabel',
                                )}
                                description={t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.privateKeyFileDescription',
                                )}
                                placeholder={t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.privateKeyFilePlaceholder',
                                )}
                                accept=".p8"
                                value={privateKeyFile}
                                disabled={disabled}
                                error={form.errors[PRIVATE_KEY_FIELD_PATH]}
                                onChange={(file) => {
                                    setPrivateKeyFile(null);
                                    if (!file) {
                                        form.setFieldValue(
                                            'credentials.privateKey',
                                            undefined,
                                        );
                                        return;
                                    }

                                    const fileReader = new FileReader();
                                    fileReader.onload = (event) => {
                                        const contents = event.target?.result;
                                        setPrivateKeyFile(
                                            typeof contents === 'string'
                                                ? file
                                                : null,
                                        );
                                        form.setFieldValue(
                                            'credentials.privateKey',
                                            typeof contents === 'string'
                                                ? contents
                                                : undefined,
                                        );
                                    };
                                    fileReader.onerror = () => {
                                        setPrivateKeyFile(null);
                                        form.setFieldValue(
                                            'credentials.privateKey',
                                            undefined,
                                        );
                                    };
                                    fileReader.readAsText(file);
                                }}
                            />
                            <PasswordInput
                                size="xs"
                                label={t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.privateKeyPassphraseLabel',
                                )}
                                description={t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.privateKeyPassphraseDescription',
                                )}
                                disabled={disabled}
                                {...form.getInputProps(
                                    'credentials.privateKeyPass',
                                )}
                            />
                        </>
                    ) : (
                        <PasswordInput
                            required
                            size="xs"
                            label={t(
                                'myWarehouseConnectionsPanel.warehouseFormInputs.passwordLabel',
                            )}
                            disabled={disabled}
                            {...form.getInputProps('credentials.password')}
                        />
                    )}
                </>
            )}
        </Stack>
    );
};

const DatabricksFormInputs: FC<{
    disabled: boolean;
    form: UseFormReturnType<UpsertUserWarehouseCredentials>;
    onClose: () => void;
    projectUuid?: string;
    projectName?: string;
    credentialsName?: string;
}> = ({
    disabled,
    form,
    onClose,
    projectUuid,
    projectName,
    credentialsName,
}) => {
    const { t } = useTranslation('userSettings');
    const { mutate: openLoginPopup, isSsoEnabled } = useDatabricksLoginPopup({
        onLogin: async () => {
            onClose();
        },
        projectUuid,
        projectName,
        credentialsName,
    });

    const authenticationType =
        form.values.credentials.type === WarehouseTypes.DATABRICKS
            ? form.values.credentials.authenticationType
            : undefined;

    return (
        <Stack gap="xs">
            {isSsoEnabled && (
                <Select
                    required
                    allowDeselect={false}
                    size="xs"
                    label={t(
                        'myWarehouseConnectionsPanel.warehouseFormInputs.authenticationTypeLabel',
                    )}
                    data={[
                        {
                            value: DatabricksAuthenticationType.OAUTH_U2M,
                            label: getSsoLabel(WarehouseTypes.DATABRICKS),
                        },
                        {
                            value: DatabricksAuthenticationType.PERSONAL_ACCESS_TOKEN,
                            label: PERSONAL_ACCESS_TOKEN_LABEL,
                        },
                    ]}
                    disabled={disabled}
                    {...form.getInputProps('credentials.authenticationType')}
                />
            )}

            {authenticationType === DatabricksAuthenticationType.OAUTH_U2M ? (
                // If this popup happens, it means we don't have warehouse credentials,
                // (aka isAuthenticated is false), so we need to authenticate
                <WarehouseSsoButton
                    warehouseType={WarehouseTypes.DATABRICKS}
                    providerName="Databricks"
                    disabled={false}
                    openLoginPopup={openLoginPopup}
                />
            ) : (
                <PasswordInput
                    required
                    size="xs"
                    label={t(
                        'myWarehouseConnectionsPanel.warehouseFormInputs.personalAccessTokenLabel',
                    )}
                    description={t(
                        'myWarehouseConnectionsPanel.warehouseFormInputs.personalAccessTokenDescription',
                    )}
                    disabled={disabled}
                    {...form.getInputProps('credentials.personalAccessToken')}
                />
            )}
        </Stack>
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
    const { t } = useTranslation('userSettings');
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
                            ? t(
                                  'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.openFromProjectTooltip',
                              )
                            : !isAwsSsoConfigured
                              ? t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.askAdminTooltip',
                                )
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
                        {t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.browserSignInUnavailable',
                        )}
                    </Text>
                )}
                {projectUuid && !isAwsSsoConfigured && (
                    <Text fz="xs" c="dimmed">
                        {t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.askAdmin',
                        )}
                    </Text>
                )}

                <TextInput
                    size="xs"
                    label={t(
                        'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.databaseUserLabel',
                    )}
                    description={t(
                        'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.databaseUserDescription',
                    )}
                    disabled={disabled}
                    {...form.getInputProps('credentials.user')}
                />
            </Stack>
        );
    }

    return (
        <Stack gap="xs">
            <Alert color="blue" icon={<MantineIcon icon={IconInfoCircle} />}>
                <Stack gap="xxs">
                    <Text fz="xs">
                        {t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.alert.pasteCredentials',
                        )}
                    </Text>
                    <Code fz="xs">
                        aws configure export-credentials --format env-no-export
                    </Code>
                    <Text fz="xs">
                        <Trans
                            t={t}
                            i18nKey="myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.alert.namedProfile"
                            components={{ code: <Code fz="xs" /> }}
                        />
                    </Text>
                    <Text fz="xs">
                        {t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.alert.advancedOptions',
                        )}
                    </Text>
                </Stack>
            </Alert>

            <TextInput
                withAsterisk
                size="xs"
                label={t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.accessKeyIdLabel',
                )}
                description={t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.accessKeyIdDescription',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.accessKeyId')}
            />
            <PasswordInput
                withAsterisk
                size="xs"
                label={t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.secretAccessKeyLabel',
                )}
                description={t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.secretAccessKeyDescription',
                )}
                disabled={disabled}
                {...form.getInputProps('credentials.secretAccessKey')}
            />
            <PasswordInput
                size="xs"
                label={t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.sessionTokenLabel',
                )}
                description={t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.sessionTokenDescription',
                )}
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
                {t(
                    'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.advancedOptions',
                )}
            </Button>

            <Collapse expanded={isAdvancedOpen}>
                <Stack gap="xs">
                    <TextInput
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.databaseUserLabel',
                        )}
                        description={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.databaseUserDescription',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    <TextInput
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.assumeRoleArnLabel',
                        )}
                        description={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.assumeRoleArnDescription',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.assumeRoleArn')}
                    />
                    <TextInput
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.assumeRoleExternalIdLabel',
                        )}
                        description={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftIam.assumeRoleExternalIdDescription',
                        )}
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
    existingAthenaAccessKeyId?: string;
}> = ({
    form,
    disabled,
    onClose,
    onSuccess,
    projectUuid,
    projectName,
    databricksCredentialsName,
    existingAthenaAccessKeyId,
}) => {
    const { t } = useTranslation('userSettings');
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
            return (
                <SnowflakeFormInput
                    disabled={disabled}
                    form={form}
                    onClose={onClose}
                />
            );
        case WarehouseTypes.POSTGRES:
        case WarehouseTypes.TRINO:
        case WarehouseTypes.CLICKHOUSE:
            return (
                <>
                    <TextInput
                        required
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.usernameLabel',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.user')}
                    />
                    <PasswordInput
                        required
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.passwordLabel',
                        )}
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
                            label={t(
                                'myWarehouseConnectionsPanel.warehouseFormInputs.authenticationTypeLabel',
                            )}
                            data={[
                                {
                                    value: RedshiftAuthenticationType.PASSWORD,
                                    label: t(
                                        'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftAuth.usernamePassword',
                                    ),
                                },
                                {
                                    value: RedshiftAuthenticationType.IAM,
                                    label: t(
                                        'myWarehouseConnectionsPanel.warehouseFormInputs.redshiftAuth.iamCli',
                                    ),
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
                                label={t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.usernameLabel',
                                )}
                                disabled={disabled}
                                {...form.getInputProps('credentials.user')}
                            />
                            <PasswordInput
                                required
                                size="xs"
                                label={t(
                                    'myWarehouseConnectionsPanel.warehouseFormInputs.passwordLabel',
                                )}
                                disabled={disabled}
                                {...form.getInputProps('credentials.password')}
                            />
                        </>
                    )}
                </>
            );
        case WarehouseTypes.BIGQUERY:
            return (
                <BigQueryFormInput onClose={onClose} onSuccess={onSuccess} />
            );
        case WarehouseTypes.DATABRICKS:
            return (
                <DatabricksFormInputs
                    disabled={disabled}
                    form={form}
                    onClose={onClose}
                    projectUuid={projectUuid}
                    projectName={projectName}
                    credentialsName={databricksCredentialsName}
                />
            );
        case WarehouseTypes.ATHENA:
            const accessKeyId = form.values.credentials.accessKeyId?.trim();
            const isSecretAccessKeyRequired =
                !existingAthenaAccessKeyId ||
                accessKeyId !== existingAthenaAccessKeyId;
            return (
                <>
                    <TextInput
                        required
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.athena.accessKeyIdLabel',
                        )}
                        disabled={disabled}
                        {...form.getInputProps('credentials.accessKeyId')}
                    />
                    <PasswordInput
                        withAsterisk={isSecretAccessKeyRequired}
                        size="xs"
                        label={t(
                            'myWarehouseConnectionsPanel.warehouseFormInputs.athena.secretAccessKeyLabel',
                        )}
                        description={
                            isSecretAccessKeyRequired
                                ? undefined
                                : t(
                                      'myWarehouseConnectionsPanel.warehouseFormInputs.athena.keepSecretAccessKey',
                                  )
                        }
                        disabled={disabled}
                        {...form.getInputProps('credentials.secretAccessKey')}
                    />
                </>
            );
        case WarehouseTypes.DUCKDB:
            return (
                <PasswordInput
                    size="xs"
                    label={t(
                        'myWarehouseConnectionsPanel.warehouseFormInputs.motherDuck.tokenLabel',
                    )}
                    description={t(
                        'myWarehouseConnectionsPanel.warehouseFormInputs.motherDuck.tokenDescription',
                    )}
                    disabled={disabled}
                    {...form.getInputProps('credentials.token')}
                />
            );
        default:
            return null;
    }
};
