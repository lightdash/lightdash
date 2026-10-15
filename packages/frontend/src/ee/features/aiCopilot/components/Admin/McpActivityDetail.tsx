import { type McpActivityItem } from '@lightdash/common';
import {
    Code,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    return (
        <Group gap="xs" wrap="nowrap">
            <Text fw={600}>{t('mcp.detail.title')}</Text>
            <ToolNamePill name={toolCall.toolName} />
            <ToolCallStatusIndicator status={toolCall.status} />
        </Group>
    );
};

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
    const { t } = useTranslation('aiCopilotAdmin');
    const isOutbound = toolCall.direction === 'outbound';
    const rows: { label: string; value: ReactNode }[] = [
        {
            label: t('mcp.detail.time'),
            value: (
                <Tooltip label={formatToolCallTimeFull(toolCall.createdAt)}>
                    <Text fz="sm" display="inline-block">
                        {formatToolCallTime(toolCall.createdAt)}
                    </Text>
                </Tooltip>
            ),
        },
        {
            label: t('mcp.detail.user'),
            value: toolCall.user.email
                ? t('mcp.detail.userWithEmail', {
                      name: toolCall.user.name,
                      email: toolCall.user.email,
                  })
                : toolCall.user.name,
        },
        {
            label: t('mcp.detail.project'),
            value: toolCall.project?.name ?? '—',
        },
        { label: t('mcp.detail.agent'), value: toolCall.agent?.name ?? '—' },
        {
            label: t('mcp.detail.duration'),
            value: formatToolCallDuration(toolCall.durationMs),
        },
        ...(isOutbound
            ? [
                  {
                      label: t('mcp.detail.direction'),
                      value: t('mcp.detail.outbound'),
                  },
                  {
                      label: t('mcp.detail.mcpServer'),
                      value:
                          toolCall.mcpServer?.name ??
                          t('mcp.detail.deletedServer'),
                  },
              ]
            : [
                  {
                      label: t('mcp.detail.direction'),
                      value: t('mcp.detail.inbound'),
                  },
                  {
                      label: t('mcp.detail.client'),
                      value: toolCall.clientName
                          ? `${toolCall.clientName}${
                                toolCall.clientVersion
                                    ? ` ${toolCall.clientVersion}`
                                    : ''
                            }`
                          : '—',
                  },
                  {
                      label: t('mcp.detail.userAgent'),
                      value: toolCall.userAgent ?? '—',
                  },
                  {
                      label: t('mcp.detail.protocol'),
                      value: toolCall.protocolVersion ?? '—',
                  },
              ]),
        { label: t('mcp.detail.auth'), value: toolCall.authType },
        {
            label: isOutbound
                ? t('mcp.detail.thread')
                : t('mcp.detail.session'),
            value: toolCall.sessionId ? (
                <Text fz="sm" ff="monospace" ta="right" truncate>
                    {toolCall.sessionId}
                </Text>
            ) : (
                '—'
            ),
        },
    ];

    return (
        <Stack gap="md" p="md">
            {toolCall.errorMessage && (
                <Callout variant="danger" title={t('mcp.detail.error')}>
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
                        <Text fz="sm" c="dimmed" flex="0 0 auto">
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
                <SectionLabel>{t('mcp.detail.arguments')}</SectionLabel>
                <ScrollArea.Autosize mah={400}>
                    <Code block fz="xs">
                        {serializeArgs(toolCall.toolArgs)}
                    </Code>
                </ScrollArea.Autosize>
            </Stack>
        </Stack>
    );
};
