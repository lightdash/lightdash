import {
    FeatureFlags,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type DepositSnowflakeCredentials,
} from '@lightdash/common';
import {
    TextInput,
    Anchor,
    Button,
    FileInput,
    Group,
    Radio,
    Stack,
    Text,
    Select,
    PasswordInput,
} from '@mantine-8/core';
import { NumberInput, Tooltip } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { useToggle } from 'react-use';
import { useOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import {
    useIsSnowflakeAuthenticated,
    useSnowflakeDatasets,
    useSnowflakeLoginPopup,
} from '../../../hooks/useSnowflake';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { getWarehouseIcon } from '../ProjectConnectFlow/utils';
import { useProjectFormContext } from '../useProjectFormContext';
import DataTimezoneField from './DataTimezoneField';
import { SnowflakeDefaultValues } from './defaultValues';
import SnowflakeCliSsoPanel from './SnowflakeCliSsoPanel';
import {
    CLI_SSO_LABEL,
    EXTERNAL_BROWSER_LABEL,
    getSsoLabel,
    NONE_LABEL,
    PASSWORD_LABEL,
    PRIVATE_KEY_LABEL,
} from './util';
import styles from './WarehouseButtons.module.css';

const CLI_SSO_OPTION_VALUE = 'cli-sso';

export const SnowflakeSchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const form = useFormContext();
    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description={description ?? 'This is the schema name.'}
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const SnowflakeSSOInput: FC<{
    isAuthenticated: boolean;
    disabled: boolean;
    openLoginPopup: () => void;
}> = ({ isAuthenticated, disabled, openLoginPopup }) => {
    if (isAuthenticated) return null;

    return (
        <Button
            onClick={() => {
                openLoginPopup();
            }}
            variant="default"
            color="gray"
            disabled={disabled}
            leftSection={getWarehouseIcon(WarehouseTypes.SNOWFLAKE, 'sm')}
            className={styles.signInButton}
        >
            Sign in with Snowflake
        </Button>
    );
};

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const { track } = useTracking();
    const { health } = useApp();
    const form = useFormContext();
    const {
        data,
        isInitialLoading: isLoadingAuth,
        error: snowflakeAuthError,
        refetch: refetchAuth,
    } = useIsSnowflakeAuthenticated();
    const isSso =
        form.values.warehouse?.type === WarehouseTypes.SNOWFLAKE &&
        form.values.warehouse.authenticationType ===
            SnowflakeAuthenticationType.SSO;
    const isAuthenticated =
        data !== undefined && snowflakeAuthError === null && isSso;
    const { refetch: refetchDatasets } = useSnowflakeDatasets();
    const { mutate: openLoginPopup, isSsoEnabled } = useSnowflakeLoginPopup({
        onLogin: async () => {
            await refetchAuth();
            refetchDatasets();
        },
    });

    const { data: orgCredentials } = useOrganizationWarehouseCredentials();
    const snowflakeOrgCredentials =
        orgCredentials?.filter(
            (cred) => cred.warehouseType === WarehouseTypes.SNOWFLAKE,
        ) || [];

    const [useOrgCredentials, setUseOrgCredentials] = useState(
        !!savedProject?.organizationWarehouseCredentialsUuid,
    );

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;

    const [temporaryFile, setTemporaryFile] = useState<File>();
    const showSaveCredentials = !!health.data?.isSaveCredentialsFormEnabled;
    const isEditMode = !!savedProject;

    const warehouseConnectFlag = useServerFeatureFlag(
        FeatureFlags.WarehouseConnectOnboarding,
    );
    const isCliSsoEnabled =
        !savedProject && (warehouseConnectFlag.data?.enabled ?? false);
    const [isCliSsoMode, setIsCliSsoMode] = useState(false);
    const userSelectedAuthType = useRef(false);
    const [cliSsoCredentials, setCliSsoCredentials] =
        useState<DepositSnowflakeCredentials | null>(null);

    if (form.values.warehouse?.type !== WarehouseTypes.SNOWFLAKE) {
        throw new Error('Snowflake form is not used for this warehouse type');
    }

    const savedAuthType =
        savedProject?.warehouseConnection?.type === WarehouseTypes.SNOWFLAKE
            ? savedProject?.warehouseConnection?.authenticationType
            : undefined;
    const hasPrivateKey =
        savedProject !== undefined
            ? savedAuthType === SnowflakeAuthenticationType.PRIVATE_KEY
            : true;
    const defaultAuthType = savedAuthType
        ? savedAuthType
        : isSsoEnabled
          ? SnowflakeAuthenticationType.SSO
          : hasPrivateKey
            ? SnowflakeAuthenticationType.PRIVATE_KEY
            : SnowflakeAuthenticationType.PASSWORD;

    useEffect(() => {
        if (!form.isTouched()) {
            form.setFieldValue('warehouse.authenticationType', defaultAuthType);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultAuthType]);

    useEffect(() => {
        if (isCliSsoEnabled && !userSelectedAuthType.current) {
            setIsCliSsoMode(true);
        }
    }, [isCliSsoEnabled]);
    const authenticationType: SnowflakeAuthenticationType =
        form.values.warehouse.authenticationType ?? defaultAuthType;

    const isNoneAuth = authenticationType === SnowflakeAuthenticationType.NONE;

    // Build base authentication options
    const baseAuthOptions = isSsoEnabled
        ? [
              {
                  value: SnowflakeAuthenticationType.SSO,
                  label: getSsoLabel(WarehouseTypes.SNOWFLAKE),
              },
              {
                  value: SnowflakeAuthenticationType.PRIVATE_KEY,
                  label: PRIVATE_KEY_LABEL,
              },
              {
                  value: SnowflakeAuthenticationType.PASSWORD,
                  label: PASSWORD_LABEL,
              },
          ]
        : [
              {
                  value: SnowflakeAuthenticationType.PRIVATE_KEY,
                  label: PRIVATE_KEY_LABEL,
              },
              {
                  value: SnowflakeAuthenticationType.PASSWORD,
                  label: PASSWORD_LABEL,
              },
          ];

    // Only show EXTERNAL_BROWSER if it's already selected (edit mode only)
    const authOptions = [
        ...baseAuthOptions,
        ...(isCliSsoEnabled
            ? [
                  {
                      value: CLI_SSO_OPTION_VALUE,
                      label: CLI_SSO_LABEL,
                  },
              ]
            : []),
        ...(savedAuthType === SnowflakeAuthenticationType.EXTERNAL_BROWSER
            ? [
                  {
                      value: SnowflakeAuthenticationType.EXTERNAL_BROWSER,
                      label: EXTERNAL_BROWSER_LABEL,
                  },
              ]
            : []),
        ...(showSaveCredentials && isEditMode
            ? [
                  {
                      value: SnowflakeAuthenticationType.NONE,
                      label: NONE_LABEL,
                  },
              ]
            : []),
    ];

    const handleCliSsoDeposited = useCallback(
        (credentials: DepositSnowflakeCredentials) => {
            form.setFieldValue('warehouse', {
                ...SnowflakeDefaultValues,
                ...credentials,
            });
            setCliSsoCredentials(credentials);
        },
        [form],
    );

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                {snowflakeOrgCredentials?.length > 0 && (
                    <Radio.Group
                        value={useOrgCredentials ? 'org' : 'manual'}
                        name="useOrgCredentials"
                        onChange={(value) => {
                            const useOrg = value === 'org';
                            setUseOrgCredentials(useOrg);
                            if (useOrg) {
                                // Clear manual fields when switching to org credentials
                                form.setFieldValue(
                                    'organizationWarehouseCredentialsUuid',
                                    snowflakeOrgCredentials[0]
                                        ?.organizationWarehouseCredentialsUuid,
                                );
                            } else {
                                form.setFieldValue(
                                    'organizationWarehouseCredentialsUuid',
                                    undefined,
                                );
                            }
                        }}
                        label="Credentials source"
                        description="Choose whether to use organization-level credentials or configure new credentials"
                    >
                        <Stack mt="xs">
                            <Radio
                                value="org"
                                label="Use organization credentials"
                                disabled={disabled}
                            />
                            <Radio
                                value="manual"
                                label="Configure new credentials"
                                disabled={disabled}
                            />
                        </Stack>
                    </Radio.Group>
                )}
                {useOrgCredentials && snowflakeOrgCredentials.length > 0 && (
                    <Select
                        allowDeselect={false}
                        label="Organization credentials"
                        description="Select which organization credentials to use for this project"
                        placeholder="Select credentials"
                        data={snowflakeOrgCredentials.map((cred) => ({
                            value: cred.organizationWarehouseCredentialsUuid,
                            label: cred.name,
                        }))}
                        value={
                            form.values.organizationWarehouseCredentialsUuid ||
                            savedProject?.organizationWarehouseCredentialsUuid
                        }
                        onChange={(value) => {
                            form.setFieldValue(
                                'organizationWarehouseCredentialsUuid',
                                value || undefined,
                            );
                        }}
                        disabled={disabled}
                        required
                    />
                )}
                {!useOrgCredentials && (
                    <>
                        <TextInput
                            name="warehouse.account"
                            label="Account"
                            placeholder="AAA99827"
                            description={
                                isCliSsoMode && cliSsoCredentials !== null
                                    ? 'Your CLI SSO connection is bound to this account.'
                                    : 'This is the account to connect to.'
                            }
                            required
                            {...form.getInputProps('warehouse.account')}
                            disabled={
                                disabled ||
                                (isCliSsoMode && cliSsoCredentials !== null)
                            }
                            labelProps={{ style: { marginTop: '8px' } }}
                        />

                        <Group gap="sm">
                            <Select
                                allowDeselect={false}
                                name="warehouse.authenticationType"
                                value={
                                    isCliSsoMode
                                        ? CLI_SSO_OPTION_VALUE
                                        : authenticationType
                                }
                                onChange={(value) => {
                                    userSelectedAuthType.current = true;
                                    if (value === CLI_SSO_OPTION_VALUE) {
                                        track({
                                            name: EventName.CREATE_PROJECT_CLI_SSO_OPTION_CLICKED,
                                        });
                                        setIsCliSsoMode(true);
                                        return;
                                    }
                                    setIsCliSsoMode(false);
                                    setCliSsoCredentials(null);
                                    form.setFieldValue(
                                        'warehouse.authenticationType',
                                        value as SnowflakeAuthenticationType,
                                    );
                                }}
                                label="Authentication Type"
                                description={
                                    isSsoEnabled &&
                                    isLoadingAuth ? null : isAuthenticated ? (
                                        <Text mt="0" c="gray" fs="xs">
                                            You are connected to Snowflake,{' '}
                                            <Anchor
                                                inherit
                                                href="#"
                                                onClick={() => {
                                                    openLoginPopup();
                                                }}
                                            >
                                                Click here to reauthenticate.
                                            </Anchor>
                                        </Text>
                                    ) : (
                                        'Choose how to authenticate with your data warehouse.'
                                    )
                                }
                                data={authOptions}
                                required
                                disabled={disabled}
                                w={isAuthenticated ? '90%' : '100%'}
                            />
                            {isAuthenticated && (
                                <Tooltip label="You are connected to Snowflake">
                                    <Group mt="40px">
                                        <MantineIcon
                                            icon={IconCheck}
                                            color="green"
                                        />
                                    </Group>
                                </Tooltip>
                            )}
                        </Group>

                        {isCliSsoMode ? (
                            <SnowflakeCliSsoPanel
                                account={form.values.warehouse.account}
                                disabled={disabled}
                                connectedCredentials={cliSsoCredentials}
                                onDeposited={handleCliSsoDeposited}
                            />
                        ) : (
                            <>
                                {!isNoneAuth &&
                                    authenticationType !==
                                        SnowflakeAuthenticationType.SSO &&
                                    authenticationType !==
                                        SnowflakeAuthenticationType.EXTERNAL_BROWSER && (
                                        <>
                                            <TextInput
                                                name="warehouse.user"
                                                label="User"
                                                description="This is the database user name."
                                                required={requireSecrets}
                                                {...form.getInputProps(
                                                    'warehouse.user',
                                                )}
                                                placeholder={
                                                    disabled || !requireSecrets
                                                        ? '**************'
                                                        : undefined
                                                }
                                                disabled={disabled}
                                            />
                                            <TextInput
                                                name="warehouse.role"
                                                label="Role"
                                                description="This is the role to assume when running queries as the specified user."
                                                {...form.getInputProps(
                                                    'warehouse.role',
                                                )}
                                                disabled={disabled}
                                            />
                                        </>
                                    )}

                                {isNoneAuth ? (
                                    <>
                                        <Text size="sm" c="dimmed">
                                            No project-level credentials will be
                                            used. Users must provide their own
                                            credentials to connect.
                                        </Text>
                                        <BooleanSwitch
                                            name="warehouse.requireUserCredentials"
                                            label="Require users to provide their own credentials"
                                            defaultChecked={
                                                SnowflakeDefaultValues.requireUserCredentials
                                            }
                                            disabled={disabled}
                                            {...form.getInputProps(
                                                'warehouse.requireUserCredentials',
                                                {
                                                    type: 'checkbox',
                                                },
                                            )}
                                        />
                                    </>
                                ) : authenticationType ===
                                  SnowflakeAuthenticationType.PRIVATE_KEY ? (
                                    <>
                                        <FileInput
                                            name="warehouse.privateKey"
                                            {...form.getInputProps(
                                                'warehouse.privateKey',
                                            )}
                                            label="Private Key File"
                                            placeholder={
                                                !requireSecrets
                                                    ? '**************'
                                                    : 'Choose file...'
                                            }
                                            description={
                                                <p>
                                                    This is the .p8 private key
                                                    file. You can see{' '}
                                                    <Anchor
                                                        inherit
                                                        target="_blank"
                                                        href="https://docs.snowflake.com/en/user-guide/key-pair-auth#generate-the-private-key"
                                                        rel="noreferrer"
                                                    >
                                                        how to create a key here
                                                    </Anchor>
                                                    .
                                                </p>
                                            }
                                            required={requireSecrets}
                                            accept=".p8"
                                            value={temporaryFile}
                                            onChange={(file) => {
                                                if (!file) {
                                                    form.setFieldValue(
                                                        'warehouse.privateKey',
                                                        null,
                                                    );
                                                    return;
                                                }

                                                const fileReader =
                                                    new FileReader();
                                                fileReader.onload = function (
                                                    event,
                                                ) {
                                                    const contents =
                                                        event.target?.result;
                                                    setTemporaryFile(file);

                                                    if (
                                                        typeof contents ===
                                                        'string'
                                                    ) {
                                                        form.setFieldValue(
                                                            'warehouse.privateKey',
                                                            contents,
                                                        );
                                                    } else {
                                                        form.setFieldValue(
                                                            'warehouse.privateKey',
                                                            null,
                                                        );
                                                    }
                                                };
                                                fileReader.readAsText(file);
                                            }}
                                            disabled={disabled}
                                        />

                                        <PasswordInput
                                            name="warehouse.privateKeyPass"
                                            label="Private Key Passphrase"
                                            description="Optional passphrase for encrypted private keys"
                                            {...form.getInputProps(
                                                'warehouse.privateKeyPass',
                                            )}
                                            placeholder={
                                                disabled || !requireSecrets
                                                    ? '**************'
                                                    : undefined
                                            }
                                            disabled={disabled}
                                        />
                                    </>
                                ) : authenticationType ===
                                  SnowflakeAuthenticationType.SSO ? (
                                    !isLoadingAuth && (
                                        <SnowflakeSSOInput
                                            isAuthenticated={isAuthenticated}
                                            disabled={disabled}
                                            openLoginPopup={openLoginPopup}
                                        />
                                    )
                                ) : authenticationType ===
                                  SnowflakeAuthenticationType.EXTERNAL_BROWSER ? (
                                    <Text size="sm" c="dimmed">
                                        External browser authentication is
                                        configured. Authentication will occur
                                        through your default browser when
                                        connecting to Snowflake.
                                    </Text>
                                ) : (
                                    <>
                                        <PasswordInput
                                            name="warehouse.password"
                                            label="Password"
                                            description="This is the database user password."
                                            required={requireSecrets}
                                            placeholder={
                                                disabled || !requireSecrets
                                                    ? '**************'
                                                    : undefined
                                            }
                                            {...form.getInputProps(
                                                'warehouse.password',
                                            )}
                                            disabled={disabled}
                                        />
                                    </>
                                )}

                                <TextInput
                                    name="warehouse.database"
                                    label="Database"
                                    description="This is the database name."
                                    required
                                    {...form.getInputProps(
                                        'warehouse.database',
                                    )}
                                    disabled={disabled}
                                />
                                <TextInput
                                    name="warehouse.warehouse"
                                    label="Warehouse"
                                    description="This is the warehouse name."
                                    required
                                    {...form.getInputProps(
                                        'warehouse.warehouse',
                                    )}
                                    disabled={disabled}
                                />
                                <BooleanSwitch
                                    name="warehouse.override"
                                    {...form.getInputProps(
                                        'warehouse.override',
                                        {
                                            type: 'checkbox',
                                        },
                                    )}
                                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse"
                                    label="Always use this warehouse"
                                    onLabel="Yes"
                                    offLabel="No"
                                    disabled={disabled}
                                />

                                <FormSection isOpen={isOpen} name="advanced">
                                    <Stack style={{ marginTop: '8px' }}>
                                        {!isNoneAuth && (
                                            <BooleanSwitch
                                                name="warehouse.requireUserCredentials"
                                                label="Require users to provide their own credentials"
                                                defaultChecked={
                                                    SnowflakeDefaultValues.requireUserCredentials
                                                }
                                                disabled={disabled}
                                                {...form.getInputProps(
                                                    'warehouse.requireUserCredentials',
                                                    {
                                                        type: 'checkbox',
                                                    },
                                                )}
                                            />
                                        )}

                                        <BooleanSwitch
                                            name="warehouse.clientSessionKeepAlive"
                                            label="Keep client session alive"
                                            description={
                                                <p>
                                                    This is intended to keep
                                                    Snowflake sessions alive
                                                    beyond the typical 4 hour
                                                    timeout limit You can see
                                                    more details in{' '}
                                                    <Anchor
                                                        inherit
                                                        target="_blank"
                                                        href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                                        rel="noreferrer"
                                                    >
                                                        dbt documentation
                                                    </Anchor>
                                                    .
                                                </p>
                                            }
                                            onLabel="Yes"
                                            offLabel="No"
                                            disabled={disabled}
                                            {...form.getInputProps(
                                                'warehouse.clientSessionKeepAlive',
                                                {
                                                    type: 'checkbox',
                                                },
                                            )}
                                        />

                                        <TextInput
                                            name="warehouse.queryTag"
                                            {...form.getInputProps(
                                                'warehouse.queryTag',
                                            )}
                                            label="Query tag"
                                            description={
                                                <p>
                                                    This is Snowflake query tags
                                                    parameter. You can see more
                                                    details in{' '}
                                                    <Anchor
                                                        inherit
                                                        target="_blank"
                                                        href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                                        rel="noreferrer"
                                                    >
                                                        dbt documentation
                                                    </Anchor>
                                                    .
                                                </p>
                                            }
                                            disabled={disabled}
                                        />

                                        <TextInput
                                            name="warehouse.accessUrl"
                                            label="Snowflake URL override"
                                            description={
                                                <p>
                                                    Usually Lightdash would
                                                    connect to a default url:
                                                    account.snowflakecomputing.com.
                                                    If you'd like to override
                                                    this (e.g. for the dbt
                                                    server) you can specify a
                                                    full custom URL here.
                                                </p>
                                            }
                                            disabled={disabled}
                                            {...form.getInputProps(
                                                'warehouse.accessUrl',
                                            )}
                                        />
                                        <DataTimezoneField
                                            disabled={disabled}
                                        />
                                        <StartOfWeekSelect
                                            disabled={disabled}
                                            isRedeployRequired={false}
                                        />
                                        <BooleanSwitch
                                            name="warehouse.disableTimestampConversion"
                                            label="Disable timestamp conversion to UTC"
                                            description="When disabled, Lightdash will skip converting timestamps to UTC. This can improve performance but requires your data to already be in UTC format."
                                            onLabel="Yes"
                                            offLabel="No"
                                            disabled={disabled}
                                            {...form.getInputProps(
                                                'warehouse.disableTimestampConversion',
                                                { type: 'checkbox' },
                                            )}
                                        />
                                        <NumberInput
                                            name="warehouse.timeoutSeconds"
                                            {...form.getInputProps(
                                                'warehouse.timeoutSeconds',
                                            )}
                                            label="Timeout in seconds"
                                            defaultValue={
                                                SnowflakeDefaultValues.timeoutSeconds
                                            }
                                            description={
                                                <p>
                                                    Sets the maximum execution
                                                    time for queries. If a query
                                                    takes longer than this
                                                    timeout, Snowflake will
                                                    cancel it. This uses
                                                    Snowflake's
                                                    STATEMENT_TIMEOUT_IN_SECONDS
                                                    session parameter.
                                                </p>
                                            }
                                            disabled={disabled}
                                        />
                                    </Stack>
                                </FormSection>
                                <FormCollapseButton
                                    isSectionOpen={isOpen}
                                    onClick={toggleOpen}
                                >
                                    Advanced configuration options
                                </FormCollapseButton>
                            </>
                        )}
                    </>
                )}
            </Stack>
        </>
    );
};

export default SnowflakeForm;
