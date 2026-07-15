import { Divider, Text } from '@mantine-8/core';
import { type FC } from 'react';

export const AndSeparator: FC = () => (
    <Divider
        label={
            <Text size="10px" fw={600} c="ldGray.6">
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
