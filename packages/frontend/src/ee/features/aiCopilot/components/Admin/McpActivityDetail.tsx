import { type McpActivityItem } from '@lightdash/common';
import {
    Code,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';
import Callout from '../../../../../components/common/Callout';
import classes from './McpActivityDetail.module.css';
import { ToolCallStatusIndicator, ToolNamePill } from './McpActivityDisplay';
import {
    formatToolCallDuration,
    formatToolCallTime,
    formatToolCallTimeFull,
} from './mcpActivityFormat';

export const McpActivityDetailTitle: FC<{ toolCall: McpActivityItem }> = ({
    toolCall,
}) => (
    <Group gap="xs" wrap="nowrap">
        <Text fw={600}>Tool call</Text>
        <ToolNamePill name={toolCall.toolName} />
        <ToolCallStatusIndicator status={toolCall.status} />
    </Group>
);

const SectionLabel: FC<{ children: ReactNode }> = ({ children }) => (
    <Text fz="xs" fw={600} c="ldGray.5" tt="uppercase" lts="0.05em">
        {children}
    </Text>
);

const serializeArgs = (toolArgs: McpActivityItem['toolArgs']): string => {
    const compact = JSON.stringify(toolArgs);
    return compact.length <= 80 ? compact : JSON.stringify(toolArgs, null, 2);
};

export const McpActivityDetail: FC<{ toolCall: McpActivityItem }> = ({
    toolCall,
}) => {
    const rows: { label: string; value: ReactNode }[] = [
        {
            label: 'Time',
            value: (
                <Tooltip
                    withinPortal
                    variant="xs"
                    label={formatToolCallTimeFull(toolCall.createdAt)}
                >
                    <Text fz="sm" display="inline-block">
                        {formatToolCallTime(toolCall.createdAt)}
                    </Text>
                </Tooltip>
            ),
        },
        {
            label: 'User',
            value: `${toolCall.user.name}${
                toolCall.user.email ? ` (${toolCall.user.email})` : ''
            }`,
        },
        { label: 'Project', value: toolCall.project?.name ?? '—' },
        { label: 'Agent', value: toolCall.agent?.name ?? '—' },
        {
            label: 'Duration',
            value: formatToolCallDuration(toolCall.durationMs),
        },
        {
            label: 'Client',
            value: toolCall.clientName
                ? `${toolCall.clientName}${
                      toolCall.clientVersion ? ` ${toolCall.clientVersion}` : ''
                  }`
                : '—',
        },
        { label: 'User agent', value: toolCall.userAgent ?? '—' },
        { label: 'Auth', value: toolCall.authType },
        { label: 'Protocol', value: toolCall.protocolVersion ?? '—' },
    ];

    return (
        <Stack gap="md" p="md">
            {toolCall.errorMessage && (
                <Callout variant="danger" title="Error">
                    {toolCall.errorMessage}
                </Callout>
            )}

            <Paper>
                {rows.map((row) => (
                    <Group
                        key={row.label}
                        className={classes.row}
                        justify="space-between"
                        wrap="nowrap"
                        gap="md"
                        px="md"
                        py="sm"
                    >
                        <Text fz="sm" c="ldGray.6" flex="0 0 auto">
                            {row.label}
                        </Text>
                        {typeof row.value === 'string' ? (
                            <Text fz="sm" ta="right" truncate>
                                {row.value}
                            </Text>
                        ) : (
                            row.value
                        )}
                    </Group>
                ))}
            </Paper>

            <Stack gap="xs">
                <SectionLabel>Arguments</SectionLabel>
                <ScrollArea.Autosize mah={400}>
                    <Code block fz="xs">
                        {serializeArgs(toolCall.toolArgs)}
                    </Code>
                </ScrollArea.Autosize>
            </Stack>
        </Stack>
    );
};
