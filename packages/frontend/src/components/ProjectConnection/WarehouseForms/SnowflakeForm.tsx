import {
    FeatureFlags,
    SnowflakeAuthenticationType,
    WarehouseTypes,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    FileInput,
    Group,
    PasswordInput,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useToggle } from 'react-use';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import {
    useIsSnowflakeAuthenticated,
    useSnowflakeDatasets,
    useSnowflakeLoginPopup,
} from '../../../hooks/useSnowflake';
import MantineIcon from '../../common/MantineIcon';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { getWarehouseIcon } from '../ProjectConnectFlow/utils';
import { useProjectFormContext } from '../useProjectFormContext';
import { SnowflakeDefaultValues } from './defaultValues';
import { getSsoLabel, PASSWORD_LABEL, PRIVATE_KEY_LABEL } from './util';

export const SnowflakeSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="This is the schema name."
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

export const SnowflakeSSOInput: FC<{
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
            leftIcon={getWarehouseIcon(WarehouseTypes.SNOWFLAKE, 'sm')}
            sx={{ ':hover': { textDecoration: 'underline' } }}
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
    const form = useFormContext();
    const {
        data,
        isLoading: isLoadingAuth,
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
            await refetchDatasets();
        },
    });

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;
    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );

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

    if (!form.isTouched()) {
        form.setFieldValue('warehouse.authenticationType', defaultAuthType);
    }
    const authenticationType: SnowflakeAuthenticationType =
        form.values.warehouse.authenticationType ?? defaultAuthType;

    const [temporaryFile, setTemporaryFile] = useState<File>();

    const authOptions = isSsoEnabled
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

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.account"
                    label="Account"
                    description="This is the account to connect to."
                    required
                    {...form.getInputProps('warehouse.account')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />

                <Group spacing="sm">
                    <Select
                        name="warehouse.authenticationType"
                        {...form.getInputProps('warehouse.authenticationType')}
                        // TODO: default value is not being recognized. private key is always being selected
                        defaultValue={defaultAuthType}
                        label="Authentication Type"
                        description={
                            isSsoEnabled &&
                            isLoadingAuth ? null : isAuthenticated ? (
                                <Text mt="0" color="gray" fs="xs">
                                    You are connected to Snowflake,{' '}
                                    <Anchor
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
                                <MantineIcon icon={IconCheck} color="green" />
                            </Group>
                        </Tooltip>
                    )}
                </Group>
                {authenticationType !== SnowflakeAuthenticationType.SSO && (
                    <>
                        <TextInput
                            name="warehouse.user"
                            label="User"
                            description="This is the database user name."
                            required={requireSecrets}
                            {...form.getInputProps('warehouse.user')}
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
                            {...form.getInputProps('warehouse.role')}
                            disabled={disabled}
                        />
                    </>
                )}

                {authenticationType ===
                SnowflakeAuthenticationType.PRIVATE_KEY ? (
                    <>
                        <FileInput
                            name="warehouse.privateKey"
                            {...form.getInputProps('warehouse.privateKey')}
                            label="Private Key File"
                            // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                            // @ts-ignore
                            placeholder={
                                !requireSecrets
                                    ? '**************'
                                    : 'Choose file...'
                            }
                            description={
                                <p>
                                    This is the .p8 private key file. You can
                                    see{' '}
                                    <Anchor
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

                                const fileReader = new FileReader();
                                fileReader.onload = function (event) {
                                    const contents = event.target?.result;
                                    setTemporaryFile(file);

                                    if (typeof contents === 'string') {
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
                            {...form.getInputProps('warehouse.privateKeyPass')}
                            placeholder={
                                disabled || !requireSecrets
                                    ? '**************'
                                    : undefined
                            }
                            disabled={disabled}
                        />
                    </>
                ) : authenticationType === SnowflakeAuthenticationType.SSO ? (
                    !isLoadingAuth && (
                        <SnowflakeSSOInput
                            isAuthenticated={isAuthenticated}
                            disabled={disabled}
                            openLoginPopup={openLoginPopup}
                        />
                    )
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
                            {...form.getInputProps('warehouse.password')}
                            disabled={disabled}
                        />
                    </>
                )}

                <TextInput
                    name="warehouse.database"
                    label="Database"
                    description="This is the database name."
                    required
                    {...form.getInputProps('warehouse.database')}
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.warehouse"
                    label="Warehouse"
                    description="This is the warehouse name."
                    required
                    {...form.getInputProps('warehouse.warehouse')}
                    disabled={disabled}
                />
                <BooleanSwitch
                    name="warehouse.override"
                    {...form.getInputProps('warehouse.override', {
                        type: 'checkbox',
                    })}
                    documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse"
                    label="Always use this warehouse"
                    onLabel="Yes"
                    offLabel="No"
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label="Require users to provide their own credentials"
                                defaultChecked={
                                    SnowflakeDefaultValues.requireUserCredentials
                                }
                                disabled={disabled}
                                {...form.getInputProps(
                                    'warehouse.requireUserCredentials',
                                    { type: 'checkbox' },
                                )}
                            />
                        )}

                        <BooleanSwitch
                            name="warehouse.clientSessionKeepAlive"
                            label="Keep client session alive"
                            description={
                                <p>
                                    This is intended to keep Snowflake sessions
                                    alive beyond the typical 4 hour timeout
                                    limit You can see more details in{' '}
                                    <Anchor
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
                                { type: 'checkbox' },
                            )}
                        />

                        <TextInput
                            name="warehouse.queryTag"
                            {...form.getInputProps('warehouse.queryTag')}
                            label="Query tag"
                            description={
                                <p>
                                    This is Snowflake query tags parameter. You
                                    can see more details in{' '}
                                    <Anchor
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
                                    Usually Lightdash would connect to a default
                                    url: account.snowflakecomputing.com. If
                                    you'd like to override this (e.g. for the
                                    dbt server) you can specify a full custom
                                    URL here.
                                </p>
                            }
                            disabled={disabled}
                            {...form.getInputProps('warehouse.accessUrl')}
                        />
                        <StartOfWeekSelect
                            disabled={disabled}
                            isRedeployRequired={false}
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

export default SnowflakeForm;
