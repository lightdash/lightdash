import { Divider, Text } from '@mantine/core';
import { type FC } from 'react';

export const AndSeparator: FC = () => (
    <Divider
        label={
            <Text size="10px" fw={600} c="dimmed">
                AND
            </Text>
        }
        labelPosition="center"
    />
);

export const OrSeparator: FC = () => (
    <Divider
        label={
            <Text size="10px" fw={500} c="ldGray.5">
                OR
            </Text>
        }
        labelPosition="center"
    />
);
