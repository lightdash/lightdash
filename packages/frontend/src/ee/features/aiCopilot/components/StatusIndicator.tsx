import { Box, Group, Text, type MantineColor } from '@mantine-8/core';
import { type FC } from 'react';
import styles from './StatusIndicator.module.css';

export const StatusIndicator: FC<{ color: MantineColor; label: string }> = ({
    color,
    label,
}) => (
    <Group gap={6} wrap="nowrap">
        <Box className={styles.dot} bg={color} />
        <Text fz="sm" c="ldGray.7">
            {label}
        </Text>
    </Group>
);
