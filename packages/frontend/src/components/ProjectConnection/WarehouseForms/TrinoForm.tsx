import { WarehouseTypes } from '@lightdash/common';
import {
    Accordion,
    Anchor,
    NumberInput,
    PasswordInput,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import React, { FC } from 'react';
import { useToggle } from 'react-use';
import FormSection from '../../ReactHookForm/FormSection';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const TrinoSchemaInput: FC<{
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

const TrinoForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.TRINO;
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.host"
                    label="Host"
                    description="This is the host where the database is running"
                    required
                    disabled={disabled}
                    defaultValue="localhost"
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
                    name="warehouse.dbname"
                    label="DB name"
                    description="This is the database name."
                    required
                    disabled={disabled}
                    defaultValue="postgres"
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <NumberInput
                            name="warehouse.port"
                            label="Port"
                            description="This is the port where the database is running."
                            required
                            disabled={disabled}
                            defaultValue={5432}
                        />
                        <Select
                            name="warehouse.http_scheme"
                            label="SSL mode"
                            description={
                                <p>
                                    This controls how dbt connects to Trino
                                    database using SSL. You can see more details
                                    in{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-setups/trino-setup#configuration"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            data={['http', 'https'].map((x) => ({
                                value: x,
                                label: x,
                            }))}
                            defaultValue="https"
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

export default TrinoForm;
