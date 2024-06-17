import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    Group,
    PasswordInput,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';

import React, { type FC } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useToggle } from 'react-use';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import {
    hasNoWhiteSpaces,
    isUppercase,
    startWithHTTPSProtocol,
} from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const SnowflakeSchemaInput: FC<{
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

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const { register } = useFormContext();

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;
    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label="Account"
                    description="This is the account to connect to."
                    required
                    {...register('warehouse.account', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Account'),
                        },
                    })}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label="User"
                    description="This is the database user name."
                    required={requireSecrets}
                    {...register('warehouse.user', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('User'),
                        },
                    })}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <PasswordInput
                    label="Password"
                    description="This is the database user password."
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...register('warehouse.password')}
                    disabled={disabled}
                />
                <TextInput
                    label="Role"
                    description="This is the role to assume when running queries as the specified user."
                    {...register('warehouse.role', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Role'),
                        },
                    })}
                    disabled={disabled}
                />
                <TextInput
                    label="Database"
                    description="This is the database name."
                    required
                    {...register('warehouse.database', {
                        validate: {
                            isUppercase: isUppercase('Database'),
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Database'),
                        },
                    })}
                    disabled={disabled}
                />
                <TextInput
                    label="Warehouse"
                    description="This is the warehouse name."
                    required
                    {...register('warehouse.warehouse', {
                        validate: {
                            isUppercase: isUppercase('Warehouse'),
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Warehouse'),
                        },
                    })}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label="Require users to provide their own credentials"
                                defaultValue={false}
                                disabled={disabled}
                            />
                        )}
                        <Controller
                            name="warehouse.clientSessionKeepAlive"
                            render={({ field }) => (
                                <Switch.Group
                                    label="Keep client session alive"
                                    description={
                                        <p>
                                            This is intended to keep Snowflake
                                            sessions alive beyond the typical 4
                                            hour timeout limit You can see more
                                            details in{' '}
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
                                    value={field.value ? ['true'] : []}
                                    onChange={(values) =>
                                        field.onChange(values.length > 0)
                                    }
                                    size="md"
                                >
                                    <Group mt="xs">
                                        <Switch
                                            onLabel="Yes"
                                            offLabel="No"
                                            value="true"
                                            disabled={disabled}
                                        />
                                    </Group>
                                </Switch.Group>
                            )}
                        />

                        <TextInput
                            {...register('warehouse.queryTag')}
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
                            {...register('warehouse.accessUrl', {
                                validate: {
                                    startWithHTTPSProtocol:
                                        startWithHTTPSProtocol(
                                            'Snowflake URL override',
                                        ),
                                    hasNoWhiteSpaces: hasNoWhiteSpaces(
                                        'Snowflake URL override',
                                    ),
                                },
                            })}
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
