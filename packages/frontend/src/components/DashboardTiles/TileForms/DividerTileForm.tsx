import { type DashboardDividerTileProperties } from '@lightdash/common';
import { SegmentedControl, Stack } from '@mantine-8/core';
import { type UseFormReturnType } from '@mantine/form';

interface DividerTileFormProps {
    form: UseFormReturnType<DashboardDividerTileProperties['properties']>;
}

const DividerTileForm = ({ form }: DividerTileFormProps) => (
    <Stack gap="md">
        <SegmentedControl
            data={[
                { label: 'Horizontal', value: 'horizontal' },
                { label: 'Vertical', value: 'vertical' },
            ]}
            {...form.getInputProps('orientation')}
        />
    </Stack>
);

export default DividerTileForm;
