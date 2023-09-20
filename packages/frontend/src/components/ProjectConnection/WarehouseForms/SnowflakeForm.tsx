import { WarehouseTypes } from '@lightdash/common';
import { Anchor, PasswordInput, Stack, TextInput } from '@mantine/core';
import React, { FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useToggle } from 'react-use';
import {
    hasNoWhiteSpaces,
    isUppercase,
    startWithHTTPSProtocol,
} from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import {
    AdvancedButton,
    AdvancedButtonWrapper,
} from '../ProjectConnection.styles';
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
                        <BooleanSwitch
                            name="warehouse.clientSessionKeepAlive"
                            label="Keep client session alive"
                            labelHelp={
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
                            disabled={disabled}
                            defaultValue={false}
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
                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <AdvancedButtonWrapper>
                    <AdvancedButton
                        icon={isOpen ? 'chevron-up' : 'chevron-down'}
                        text={`Advanced configuration options`}
                        onClick={toggleOpen}
                    />
                </AdvancedButtonWrapper>
            </Stack>
        </>
    );
};

export default SnowflakeForm;
