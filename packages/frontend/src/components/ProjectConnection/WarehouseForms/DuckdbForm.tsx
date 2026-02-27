import { WarehouseTypes } from '@lightdash/common';
import { NumberInput, PasswordInput, Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';

export const DuckdbSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="The default schema for your DuckDB/MotherDuck database."
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const DuckdbForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DUCKDB;
    const form = useFormContext();

    return (
        <Stack mt="sm">
            <TextInput
                name="warehouse.database"
                label="Database"
                description="Your MotherDuck database name (e.g. my_db)."
                required
                {...form.getInputProps('warehouse.database')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.schema"
                label="Schema"
                description="The default schema for your database."
                required
                {...form.getInputProps('warehouse.schema')}
                disabled={disabled}
                placeholder="main"
            />
            <PasswordInput
                name="warehouse.token"
                label="Service Token"
                description="Your MotherDuck service token for authentication (optional, only needed for MotherDuck cloud)."
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                {...form.getInputProps('warehouse.token')}
                disabled={disabled}
            />

            <FormSection isOpen={isOpen} name="advanced">
                <Stack mt="sm">
                    <NumberInput
                        name="warehouse.threads"
                        label="Threads"
                        description="Number of threads for dbt to use."
                        defaultValue={1}
                        {...form.getInputProps('warehouse.threads')}
                        disabled={disabled}
                    />

                    <StartOfWeekSelect disabled={disabled} />
                </Stack>
            </FormSection>
            <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                Advanced configuration options
            </FormCollapseButton>
        </Stack>
    );
};

export default DuckdbForm;
