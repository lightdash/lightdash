import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import { Anchor, PasswordInput, Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import { useProjectFormContext } from '../useProjectFormContext';
import BooleanSwitch from './Inputs/BooleanSwitch';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';
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
