import { type DashboardHeadingTileProperties } from '@lightdash/common';
import { Stack, Switch, TextInput } from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';

interface HeadingTileFormProps {
    form: UseFormReturnType<DashboardHeadingTileProperties['properties']>;
}

const HeadingTileForm = ({ form }: HeadingTileFormProps) => (
    <Stack gap="md">
        <TextInput
            label="Heading text"
            placeholder="Enter heading text"
            required
            {...form.getInputProps('text')}
        />
        <Switch
            label="Display a divider below the heading"
            checked={form.values.showDivider ?? false}
            onChange={(e) =>
                form.setFieldValue('showDivider', e.currentTarget.checked)
            }
        />
    </Stack>
);

export default HeadingTileForm;
