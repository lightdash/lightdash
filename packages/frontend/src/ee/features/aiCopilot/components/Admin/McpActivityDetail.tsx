import { type McpActivityItem } from '@lightdash/common';
import {
    Badge,
    Code,
    Divider,
    Group,
    ScrollArea,
    Stack,
    Text,
} from '@mantine-8/core';
import { type FC } from 'react';
import Callout from '../../../../../components/common/Callout';

const DetailRow: FC<{ label: string; children: React.ReactNode }> = ({
    label,
    children,
}) => (
    <Group justify="space-between" wrap="nowrap" gap="md">
        <Text fz="sm" c="ldGray.6" fw={500} style={{ whiteSpace: 'nowrap' }}>
            {label}
        </Text>
        {children}
    </Group>
);

export const McpActivityDetail: FC<{ toolCall: McpActivityItem }> = ({
    toolCall,
}) => {
    const durationLabel =
        toolCall.durationMs >= 1000
            ? `${(toolCall.durationMs / 1000).toFixed(1)}s`
            : `${toolCall.durationMs}ms`;

    return (
        <Stack gap="sm" p="md">
            <Group gap="xs">
                <Badge variant="light" color="indigo" tt="none">
                    {toolCall.toolName}
                </Badge>
                <Badge
                    variant="light"
                    color={toolCall.status === 'error' ? 'red' : 'green'}
                >
                    {toolCall.status}
                </Badge>
            </Group>

            {toolCall.errorMessage && (
                <Callout variant="danger" title="Error">
                    {toolCall.errorMessage}
                </Callout>
            )}

            <Stack gap="xs">
                <DetailRow label="Time">
                    <Text fz="sm">
                        {new Date(toolCall.createdAt).toLocaleString()}
                    </Text>
                </DetailRow>
                <DetailRow label="User">
                    <Text fz="sm" truncate>
                        {toolCall.user.name}
                        {toolCall.user.email ? ` (${toolCall.user.email})` : ''}
                    </Text>
                </DetailRow>
                <DetailRow label="Project">
                    <Text fz="sm">{toolCall.project?.name ?? '—'}</Text>
                </DetailRow>
                <DetailRow label="Agent">
                    <Text fz="sm">{toolCall.agent?.name ?? '—'}</Text>
                </DetailRow>
                <DetailRow label="Duration">
                    <Text fz="sm">{durationLabel}</Text>
                </DetailRow>
                <DetailRow label="Client">
                    <Text fz="sm" truncate>
                        {toolCall.clientName
                            ? `${toolCall.clientName}${
                                  toolCall.clientVersion
                                      ? ` ${toolCall.clientVersion}`
                                      : ''
                              }`
                            : '—'}
                    </Text>
                </DetailRow>
                <DetailRow label="User agent">
                    <Text fz="sm" truncate>
                        {toolCall.userAgent ?? '—'}
                    </Text>
                </DetailRow>
                <DetailRow label="Auth">
                    <Text fz="sm">{toolCall.authType}</Text>
                </DetailRow>
                <DetailRow label="Protocol">
                    <Text fz="sm">{toolCall.protocolVersion ?? '—'}</Text>
                </DetailRow>
            </Stack>

            <Divider />

            <Stack gap="xs">
                <Text fz="sm" fw={500} c="ldGray.7">
                    Arguments
                </Text>
                <ScrollArea.Autosize mah={400}>
                    <Code block fz="xs">
                        {JSON.stringify(toolCall.toolArgs, null, 2)}
                    </Code>
                </ScrollArea.Autosize>
            </Stack>
        </Stack>
    );
};
