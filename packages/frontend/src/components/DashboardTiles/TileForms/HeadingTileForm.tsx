import { type DashboardHeadingTileProperties } from '@lightdash/common';
import { Stack, TextInput } from '@mantine-8/core';
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
    </Stack>
);

export default HeadingTileForm;
