import { type McpActivityStatus } from '@lightdash/common';
import { Box, Group, Paper, Text } from '@mantine-8/core';
import { type FC } from 'react';

export const ToolNamePill: FC<{ name: string }> = ({ name }) => (
    <Paper px="xs" maw="100%" display="inline-block">
        <Text fz="xs" ff="monospace" c="ldGray.8" truncate>
            {name}
        </Text>
    </Paper>
);

const StatusDot: FC<{ status: McpActivityStatus }> = ({ status }) => (
    <Box
        w={6}
        h={6}
        bg={status === 'error' ? 'red.6' : 'green.6'}
        style={{ borderRadius: '50%', flexShrink: 0 }}
    />
);

export const ToolCallStatusIndicator: FC<{ status: McpActivityStatus }> = ({
    status,
}) => (
    <Group gap={6} wrap="nowrap">
        <StatusDot status={status} />
        <Text fz="sm" c="ldGray.7">
            {status}
        </Text>
    </Group>
);
