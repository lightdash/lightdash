import { SegmentedControl, Stack, Text } from '@mantine/core';
import { type FC } from 'react';

type Props = {
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
};

export const BuilderLinkingField: FC<Props> = ({
    value,
    onChange,
    disabled,
}) => (
    <Stack gap={4}>
        <Text fz="sm" fw={500}>
            Who can link this connection?
        </Text>
        <SegmentedControl
            fullWidth
            disabled={disabled}
            data={[
                { value: 'admins', label: 'Admins only' },
                {
                    value: 'builders',
                    label: 'Data app and chart type builders',
                },
            ]}
            value={value ? 'builders' : 'admins'}
            onChange={(nextValue) => onChange(nextValue === 'builders')}
        />
    </Stack>
);
