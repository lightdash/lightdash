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
    Tooltip,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type ReactNode,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
import { NumberInput } from '../../common/NumberInput';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { getWarehouseIcon } from '../ProjectConnectFlow/utils';
import { useProjectFormContext } from '../useProjectFormContext';
import DataTimezoneField from './DataTimezoneField';
import { SnowflakeDefaultValues } from './defaultValues';
import SnowflakeAgentIdentityIndicator from './SnowflakeAgentIdentityIndicator';
import {
    useSetSnowflakeCliSsoMode,
    useSnowflakeCliSsoMode,
} from './SnowflakeCliSsoModeContext';
import SnowflakeCliSsoPanel from './SnowflakeCliSsoPanel';
import { getSsoLabel } from './util';
import styles from './WarehouseButtons.module.css';

const CLI_SSO_OPTION_VALUE = 'cli-sso';

export const SnowflakeSchemaInput: FC<{
    disabled: boolean;
    description?: ReactNode;
}> = ({ disabled, description }) => {
    const { t } = useTranslation('projectConnection');
    const form = useFormContext();
    const isCliSsoMode = useSnowflakeCliSsoMode();
    if (isCliSsoMode) {
        return null;
    }
    return (
        <TextInput
            name="warehouse.schema"
            label={t('warehouseFields.schema')}
            description={description ?? t('warehouseFields.schemaDescription')}
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
    const { t } = useTranslation('projectConnection');
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
            {t('warehouseFields.signInSnowflake')}
        </Button>
    );
};

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation('projectConnection');
    const [isOpen, toggleOpen] = useToggle(false);
    const {
        savedProject,
        projectUuid,
        warehouseConnectionUuid,
        isProjectExtraConnection,
        isDbtSource,
    } = useProjectFormContext();
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
        FeatureFlags.NewOnboarding,
    );
    const isCliSsoEnabled =
        !savedProject && (warehouseConnectFlag.data?.enabled ?? false);
    const isCliSsoMode = useSnowflakeCliSsoMode();
    const setIsCliSsoMode = useSetSnowflakeCliSsoMode();
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
    }, [isCliSsoEnabled, setIsCliSsoMode]);
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
                  label: t('warehouseAuth.privateKeyAuth'),
              },
              {
                  value: SnowflakeAuthenticationType.PASSWORD,
                  label: t('warehouseAuth.passwordAuth'),
              },
          ]
        : [
              {
                  value: SnowflakeAuthenticationType.PRIVATE_KEY,
                  label: t('warehouseAuth.privateKeyAuth'),
              },
              {
                  value: SnowflakeAuthenticationType.PASSWORD,
                  label: t('warehouseAuth.passwordAuth'),
              },
          ];

    // Only show EXTERNAL_BROWSER if it's already selected (edit mode only)
    const authOptions = [
        ...baseAuthOptions,
        ...(isCliSsoEnabled
            ? [
                  {
                      value: CLI_SSO_OPTION_VALUE,
                      label: t('warehouseAuth.cliSsoAuth'),
                  },
              ]
            : []),
        ...(savedAuthType === SnowflakeAuthenticationType.EXTERNAL_BROWSER
            ? [
                  {
                      value: SnowflakeAuthenticationType.EXTERNAL_BROWSER,
                      label: t('warehouseAuth.externalBrowserAuth'),
                  },
              ]
            : []),
        ...(showSaveCredentials && isEditMode
            ? [
                  {
                      value: SnowflakeAuthenticationType.NONE,
                      label: t('warehouseAuth.noneAuth'),
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
            <Stack mt="xs">
                {isEditMode &&
                    !isDbtSource &&
                    (!isProjectExtraConnection ||
                        warehouseConnectionUuid !== undefined) &&
                    (projectUuid ?? savedProject?.projectUuid) && (
                        <SnowflakeAgentIdentityIndicator
                            projectUuid={
                                (projectUuid ?? savedProject?.projectUuid)!
                            }
                            connection={warehouseConnectionUuid ?? null}
                        />
                    )}
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
                        label={t('warehouseFields.credentialsSource')}
                        description={t(
                            'warehouseFields.credentialsSourceDescription',
                        )}
                    >
                        <Stack mt="xs">
                            <Radio
                                value="org"
                                label={t(
                                    'warehouseFields.useOrganizationCredentials',
                                )}
                                disabled={disabled}
                            />
                            <Radio
                                value="manual"
                                label={t(
                                    'warehouseFields.configureNewCredentials',
                                )}
                                disabled={disabled}
                            />
                        </Stack>
                    </Radio.Group>
                )}
                {useOrgCredentials && snowflakeOrgCredentials.length > 0 && (
                    <Select
                        allowDeselect={false}
                        label={t('warehouseFields.organizationCredentials')}
                        description={t(
                            'warehouseFields.organizationCredentialsDescription',
                        )}
                        placeholder={t('warehouseFields.selectCredentials')}
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
                            label={t('warehouseFields.account')}
                            placeholder="xy12345.eu-west-2.aws"
                            description={
                                isCliSsoMode && cliSsoCredentials !== null
                                    ? t('warehouseFields.accountBoundToCliSso')
                                    : t('warehouseFields.accountDescription')
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
                                label={t('warehouseFields.authenticationType')}
                                description={
                                    isSsoEnabled &&
                                    isLoadingAuth ? null : isAuthenticated ? (
                                        <Text mt="0" c="gray" fs="xs">
                                            {t('warehouseFields.connectedTo', {
                                                warehouse: 'Snowflake',
                                            })}{' '}
                                            <Anchor
                                                inherit
                                                href="#"
                                                onClick={() => {
                                                    openLoginPopup();
                                                }}
                                            >
                                                {t(
                                                    'warehouseFields.reauthenticate',
                                                )}
                                            </Anchor>
                                        </Text>
                                    ) : (
                                        t(
                                            'warehouseFields.authenticationDescription',
                                        )
                                    )
                                }
                                data={authOptions}
                                required
                                disabled={disabled}
                                w={isAuthenticated ? '90%' : '100%'}
                            />
                            {isAuthenticated && (
                                <Tooltip
                                    label={t(
                                        'warehouseFields.connectedSnowflake',
                                    )}
                                >
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
                                                label={t(
                                                    'warehouseFields.user',
                                                )}
                                                description={t(
                                                    'warehouseFields.userDescription',
                                                )}
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
                                                label={t(
                                                    'warehouseFields.role',
                                                )}
                                                description={t(
                                                    'warehouseFields.roleDescription',
                                                )}
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
                                            {t(
                                                'warehouseFields.noProjectCredentials',
                                            )}
                                        </Text>
                                        <BooleanSwitch
                                            name="warehouse.requireUserCredentials"
                                            label={t(
                                                'warehouseFields.requireUserCredentials',
                                            )}
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
                                            label={t(
                                                'warehouseFields.privateKeyFile',
                                            )}
                                            placeholder={
                                                !requireSecrets
                                                    ? '**************'
                                                    : t(
                                                          'warehouseFields.chooseFile',
                                                      )
                                            }
                                            description={
                                                <Trans
                                                    t={t}
                                                    i18nKey="warehouseFields.privateKeyFileDescription"
                                                    components={{
                                                        docsLink: (
                                                            <Anchor
                                                                inherit
                                                                target="_blank"
                                                                href="https://docs.snowflake.com/en/user-guide/key-pair-auth#generate-the-private-key"
                                                                rel="noreferrer"
                                                            />
                                                        ),
                                                    }}
                                                />
                                            }
                                            required={requireSecrets}
                                            accept=".p8"
                                            value={temporaryFile}
                                            onChange={(file) => {
                                                if (!file) {
                                                    setTemporaryFile(undefined);
                                                    form.setFieldValue(
                                                        'warehouse.privateKey',
                                                        undefined,
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
                                                            undefined,
                                                        );
                                                    }
                                                };
                                                fileReader.onerror = () => {
                                                    setTemporaryFile(undefined);
                                                    form.setFieldValue(
                                                        'warehouse.privateKey',
                                                        undefined,
                                                    );
                                                };
                                                fileReader.readAsText(file);
                                            }}
                                            disabled={disabled}
                                        />

                                        <PasswordInput
                                            name="warehouse.privateKeyPass"
                                            label={t(
                                                'warehouseFields.privateKeyPassphrase',
                                            )}
                                            description={t(
                                                'warehouseFields.privateKeyPassphraseDescription',
                                            )}
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
                                        {t(
                                            'warehouseFields.externalBrowserConfigured',
                                        )}
                                    </Text>
                                ) : (
                                    <>
                                        <PasswordInput
                                            name="warehouse.password"
                                            label={t(
                                                'warehouseFields.password',
                                            )}
                                            description={t(
                                                'warehouseFields.passwordDescription',
                                            )}
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
                                    label={t('warehouseFields.database')}
                                    description={t(
                                        'warehouseFields.databaseNameDescription',
                                    )}
                                    required
                                    {...form.getInputProps(
                                        'warehouse.database',
                                    )}
                                    disabled={disabled}
                                />
                                <TextInput
                                    name="warehouse.warehouse"
                                    label={t('warehouseFields.warehouse')}
                                    description={t(
                                        'warehouseFields.warehouseDescription',
                                    )}
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
                                    label={t(
                                        'warehouseFields.alwaysUseWarehouse',
                                    )}
                                    onLabel={t('state.yes', { ns: 'common' })}
                                    offLabel={t('state.no', { ns: 'common' })}
                                    disabled={disabled}
                                />

                                <FormSection isOpen={isOpen} name="advanced">
                                    <Stack mt="xs">
                                        {!isNoneAuth && (
                                            <BooleanSwitch
                                                name="warehouse.requireUserCredentials"
                                                label={t(
                                                    'warehouseFields.requireUserCredentials',
                                                )}
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
                                            label={t(
                                                'warehouseFields.keepClientSessionAlive',
                                            )}
                                            description={
                                                <Trans
                                                    t={t}
                                                    i18nKey="warehouseFields.keepClientSessionAliveDescription"
                                                    components={{
                                                        docsLink: (
                                                            <Anchor
                                                                inherit
                                                                target="_blank"
                                                                href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                                                rel="noreferrer"
                                                            />
                                                        ),
                                                    }}
                                                />
                                            }
                                            onLabel={t('state.yes', {
                                                ns: 'common',
                                            })}
                                            offLabel={t('state.no', {
                                                ns: 'common',
                                            })}
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
                                            label={t(
                                                'warehouseFields.queryTag',
                                            )}
                                            description={
                                                <Trans
                                                    t={t}
                                                    i18nKey="warehouseFields.queryTagDescription"
                                                    components={{
                                                        docsLink: (
                                                            <Anchor
                                                                inherit
                                                                target="_blank"
                                                                href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                                                rel="noreferrer"
                                                            />
                                                        ),
                                                    }}
                                                />
                                            }
                                            disabled={disabled}
                                        />

                                        <TextInput
                                            name="warehouse.accessUrl"
                                            label={t(
                                                'warehouseFields.snowflakeUrlOverride',
                                            )}
                                            description={t(
                                                'warehouseFields.snowflakeUrlOverrideDescription',
                                            )}
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
                                            label={t(
                                                'warehouseFields.disableTimestampConversion',
                                            )}
                                            description={t(
                                                'warehouseFields.disableTimestampConversionDescription',
                                            )}
                                            onLabel={t('state.yes', {
                                                ns: 'common',
                                            })}
                                            offLabel={t('state.no', {
                                                ns: 'common',
                                            })}
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
                                            label={t(
                                                'warehouseFields.timeoutSeconds',
                                            )}
                                            defaultValue={
                                                SnowflakeDefaultValues.timeoutSeconds
                                            }
                                            description={
                                                <p>
                                                    {t(
                                                        'warehouseFields.snowflakeTimeoutDescription',
                                                    )}
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
                                    {t('dbtSettings.advancedOptions')}
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
