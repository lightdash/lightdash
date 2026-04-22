import { FeatureFlags } from '@lightdash/common';
import { NumberInput, PasswordInput, Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useToggle } from 'react-use';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import TimeZonePicker from '../../common/TimeZonePicker';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';

export const DuckdbSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();

    return (
        <TextInput
            name="warehouse.schema"
            label="Schema"
            description="The default schema for your MotherDuck database."
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
    const form = useFormContext();
    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );
    const isTimezoneSupportEnabled = timezoneSupportFlag?.enabled ?? false;

    return (
        <Stack mt="sm">
            <TextInput
                name="warehouse.database"
                label="Database"
                description="Your MotherDuck database name, for example `my_db`."
                required
                {...form.getInputProps('warehouse.database')}
                disabled={disabled}
            />
            <TextInput
                name="warehouse.schema"
                label="Schema"
                description="The default schema in MotherDuck, usually `main`."
                required
                {...form.getInputProps('warehouse.schema')}
                disabled={disabled}
                placeholder="main"
            />
            <PasswordInput
                name="warehouse.token"
                label="Access token"
                description="Create an access token in MotherDuck Settings."
                placeholder={disabled ? '**************' : undefined}
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

                    {isTimezoneSupportEnabled && (
                        <TimeZonePicker
                            size="sm"
                            maw="100%"
                            label="Data timezone"
                            description="The timezone your warehouse stores ambiguous timestamps in. Defaults to UTC if not set."
                            searchable
                            clearable
                            placeholder="Not set (uses warehouse default)"
                            disabled={disabled}
                            {...form.getInputProps('warehouse.dataTimezone')}
                        />
                    )}
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
