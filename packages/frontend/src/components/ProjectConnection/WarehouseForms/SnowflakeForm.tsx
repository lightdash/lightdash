import { WarehouseTypes } from '@lightdash/common';
import {
    Accordion,
    Anchor,
    Group,
    PasswordInput,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import FormSection from '../../ReactHookForm/FormSection';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const SnowflakeSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="This is the schema name."
            required
            disabled={disabled}
        />
    );
};

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.account"
                    label="Account"
                    description="This is the account to connect to."
                    required
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.user"
                    label="User"
                    description="This is the database user name."
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
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                    name={''}
                />
                <TextInput
                    name="warehouse.role"
                    label="Role"
                    description="This is the role to assume when running queries as the specified user."
                    disabled={disabled}
                />
                <TextInput
                    name="warehouse.dbname"
                    label="DB name"
                    description="This is the database name."
                    required
                    disabled={disabled}
                    defaultValue="postgres"
                />
                <TextInput
                    name="warehouse.warehouse"
                    label="Warehouse"
                    description="This is the warehouse name."
                    required
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <Switch.Group
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
                        >
                            <Group mt="xs">
                                <Switch
                                    value="yes"
                                    onLabel="Yes"
                                    offLabel="No"
                                />
                            </Group>
                        </Switch.Group>
                        <TextInput
                            name="warehouse.queryTag"
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
                        />
                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <Accordion
                    chevronPosition="left"
                    variant="filled"
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                    }}
                >
                    <Accordion.Item value="advanced configuration options">
                        <Accordion.Control
                            onClick={toggleOpen}
                            style={{
                                fontSize: '14px',
                                paddingRight: '2px',
                            }}
                        >
                            Advanced configuration options
                        </Accordion.Control>
                    </Accordion.Item>
                </Accordion>
            </Stack>
        </>
    );
};

export default SnowflakeForm;
