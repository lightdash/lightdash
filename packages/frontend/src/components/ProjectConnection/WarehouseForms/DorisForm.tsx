import { WarehouseTypes } from '@lightdash/common';
import { NumberInput, PasswordInput, Stack, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useToggle } from 'react-use';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import DataTimezoneField from './DataTimezoneField';
import { DorisDefaultValues } from './defaultValues';

export const DorisSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="This is the database name (Doris addresses tables as `database.table`)."
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const DorisForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DORIS;
    const form = useFormContext();

    if (form.values.warehouse?.type !== WarehouseTypes.DORIS) {
        throw new Error('This form is only available for Doris');
    }

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.host"
                    label="Host"
                    description="This is the host where the database is running."
                    required
                    {...form.getInputProps('warehouse.host')}
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

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label="Require users to provide their own credentials"
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                { type: 'checkbox' },
                            )}
                            defaultChecked={
                                DorisDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={DorisDefaultValues.port}
                            label="Port"
                            description="This is the Doris query port (MySQL protocol, usually 9030)."
                            required
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            defaultValue={DorisDefaultValues.timeoutSeconds}
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label="Timeout in seconds"
                            description={
                                <p>
                                    If a query takes longer than this timeout to
                                    complete, then the query will be cancelled.
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <DataTimezoneField disabled={disabled} />
                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    Advanced configuration options
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default DorisForm;
