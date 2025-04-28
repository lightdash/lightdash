import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    FileInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { useState, type FC } from 'react';
import { useToggle } from 'react-use';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import { SnowflakeDefaultValues } from './defaultValues';

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

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;
    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );

    if (form.values.warehouse?.type !== WarehouseTypes.SNOWFLAKE) {
        throw new Error('Snowflake form is not used for this warehouse type');
    }
    const hasPrivateKey =
        savedProject !== undefined
            ? savedProject?.warehouseConnection?.type ===
                  WarehouseTypes.SNOWFLAKE &&
              savedProject?.warehouseConnection?.authenticationType ===
                  'private_key'
            : true;

    const authenticationType: string =
        form.values.warehouse.authenticationType ??
        (hasPrivateKey ? 'private_key' : 'password');

    const [temporaryFile, setTemporaryFile] = useState<File>();

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

                <Select
                    name="warehouse.authenticationType"
                    {...form.getInputProps('warehouse.authenticationType')}
                    defaultValue={hasPrivateKey ? 'private_key' : 'password'}
                    label="Authentication Type"
                    description="Choose between password or key pair authentication"
                    data={[
                        {
                            value: 'private_key',
                            label: 'Private Key (recommended)',
                        },
                        {
                            value: 'password',
                            label: 'Password',
                        },
                    ]}
                    required
                    disabled={disabled}
                />

                {authenticationType === 'private_key' ? (
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
                ) : (
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
                )}
                <TextInput
                    name="warehouse.role"
                    label="Role"
                    description="This is the role to assume when running queries as the specified user."
                    {...form.getInputProps('warehouse.role')}
                    disabled={disabled}
                />
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
