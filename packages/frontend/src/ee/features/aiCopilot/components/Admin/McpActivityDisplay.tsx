import { type McpActivityStatus } from '@lightdash/common';
import { Paper, Text } from '@mantine-8/core';
import { type FC } from 'react';
import { StatusIndicator } from '../StatusIndicator';

export const ToolNamePill: FC<{ name: string }> = ({ name }) => (
    <Paper px="xs" maw="100%" display="inline-block">
        <Text fz="xs" ff="monospace" c="ldGray.8" truncate>
            {name}
        </Text>
    </Paper>
);

export const ToolCallStatusIndicator: FC<{ status: McpActivityStatus }> = ({
    status,
}) => (
    <StatusIndicator
        color={status === 'error' ? 'red.6' : 'green.6'}
        label={status}
    />
);
