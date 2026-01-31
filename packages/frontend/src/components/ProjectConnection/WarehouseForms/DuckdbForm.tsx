import { WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    NumberInput,
    Stack,
    TextInput,
} from '@mantine/core';
import React, { type FC } from 'react';
import { useToggle } from 'react-use';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { DuckdbDefaultValues } from './defaultValues';

export const DuckdbSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="The default schema to use. Defaults to 'main'."
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const DuckdbForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const form = useFormContext();

    if (form.values.warehouse?.type !== WarehouseTypes.DUCKDB) {
        throw new Error('This form is only available for DuckDB');
    }

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.path"
                    label="Database Path"
                    description={
                        <p>
                            Path to the DuckDB file (.duckdb) or use{' '}
                            <code>:memory:</code> for an in-memory database.
                            The path must be accessible from the Lightdash
                            server. See{' '}
                            <Anchor
                                target="_blank"
                                href="https://duckdb.org/docs/connect/overview"
                                rel="noreferrer"
                            >
                                DuckDB documentation
                            </Anchor>{' '}
                            for more details.
                        </p>
                    }
                    required
                    {...form.getInputProps('warehouse.path')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                    placeholder="/path/to/database.duckdb"
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <DuckdbSchemaInput disabled={disabled} />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            defaultValue={DuckdbDefaultValues.timeoutSeconds}
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label="Timeout in seconds"
                            description={
                                <p>
                                    If a query takes longer than this timeout to
                                    complete, then the query will be cancelled.
                                </p>
                            }
                            disabled={disabled}
                        />

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

export default DuckdbForm;
