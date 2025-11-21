import type {
    AiAgentMessageAssistantArtifact,
    AiAgentToolCall,
    AiAgentToolResult,
} from '@lightdash/common';
import {
    Box,
    Collapse,
    Drawer,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
} from '@mantine-8/core';
import { Prism } from '@mantine/prism';
import {
    IconBug,
    IconChevronDown,
    IconChevronRight,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useAiAgentArtifact } from '../../hooks/useAiAgentArtifacts';
import classes from './AgentChatDebugDrawer.module.css';
import { ToolResults } from './ToolResults';

type Props = {
    isVisualizationAvailable: boolean;
    isDrawerOpen: boolean;
    onClose: () => void;
    artifacts: AiAgentMessageAssistantArtifact[] | null;
    toolCalls: AiAgentToolCall[] | null;
    toolResults: AiAgentToolResult[] | null;
    agentUuid: string;
    projectUuid: string;
};

/**
 * Safely stringify an object to JSON
 * @returns JSON string or null if serialization fails
 */
const safeStringify = (obj: unknown, space?: number): string | null => {
    try {
        return JSON.stringify(obj, null, space);
    } catch (error) {
        console.error('Failed to stringify object:', error);
        return null;
    }
};

const AgentChatDebugDrawer: React.FC<Props> = ({
    isVisualizationAvailable,
    isDrawerOpen,
    onClose,
    artifacts,
    toolCalls,
    toolResults,
    agentUuid,
    projectUuid,
}) => {
    const artifact = artifacts?.[artifacts.length - 1];
    const [expandedToolCalls, setExpandedToolCalls] = useState<
        Record<string, boolean>
    >({});

    // Create a map of toolCallId -> toolResult for quick lookup
    const toolResultsMap = useMemo(() => {
        if (!toolResults) return new Map<string, AiAgentToolResult>();
        return new Map(
            toolResults.map((result) => [result.toolCallId, result]),
        );
    }, [toolResults]);

    const { data: artifactData } = useAiAgentArtifact({
        projectUuid: projectUuid,
        agentUuid: agentUuid,
        artifactUuid: artifact?.artifactUuid,
        versionUuid: artifact?.versionUuid,
    });

    const configJson = useMemo(() => {
        if (!artifactData) return null;
        const config = artifactData.chartConfig ?? artifactData.dashboardConfig;
        return safeStringify(config, 2);
    }, [artifactData]);

    const toggleToolCall = (id: string) => {
        setExpandedToolCalls((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    return (
        <Drawer
            title={
                <Group gap={6}>
                    <Paper p="xxs" withBorder radius="sm">
                        <MantineIcon icon={IconBug} size="sm" />
                    </Paper>
                    <Text fw={500} size="md">
                        Debug
                    </Text>
                </Group>
            }
            opened={isVisualizationAvailable && isDrawerOpen}
            onClose={onClose}
            size="lg"
            position="right"
            styles={{
                header: {
                    padding: '12px 16px',
                    minHeight: 'auto',
                },
                body: {
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: 16,
                    paddingTop: 0,
                },
            }}
        >
            <Stack gap="md" h="100%">
                {/* Visualization Configuration */}
                {artifactData && (
                    <Box>
                        <Group
                            justify="space-between"
                            className={classes.sectionHeader}
                        >
                            <Text fw={500} size="sm" c="dark">
                                Configuration
                            </Text>
                        </Group>
                        <ScrollArea.Autosize
                            mah={500}
                            className={classes.codeBlock}
                        >
                            {configJson ? (
                                <Prism
                                    language="json"
                                    withLineNumbers
                                    styles={{
                                        code: {
                                            fontSize: '12px',
                                        },
                                    }}
                                >
                                    {configJson}
                                </Prism>
                            ) : (
                                <Box p="md" className={classes.centerText}>
                                    <Text size="sm" c="dimmed" fs="italic">
                                        Cannot display configuration
                                    </Text>
                                </Box>
                            )}
                        </ScrollArea.Autosize>
                    </Box>
                )}

                {/* Tool Calls */}
                {toolCalls && toolCalls.length > 0 && (
                    <Box>
                        <Group
                            justify="space-between"
                            className={classes.sectionHeader}
                        >
                            <Text fw={500} size="sm" c="dark">
                                Tool Calls ({toolCalls.length})
                            </Text>
                        </Group>
                        <Stack gap="sm" mb="xl">
                            {toolCalls.map((toolCall, index) => {
                                const callId =
                                    toolCall.toolCallId || String(index);
                                const isExpanded = expandedToolCalls[callId];
                                const argsJson = safeStringify(
                                    toolCall.toolArgs,
                                    2,
                                );
                                return (
                                    <Box
                                        key={callId}
                                        className={classes.toolCallItem}
                                    >
                                        <Box
                                            className={classes.toolCallHeader}
                                            onClick={() =>
                                                toggleToolCall(callId)
                                            }
                                        >
                                            <Group
                                                justify="space-between"
                                                wrap="nowrap"
                                            >
                                                <Group gap="xs">
                                                    <MantineIcon
                                                        icon={
                                                            isExpanded
                                                                ? IconChevronDown
                                                                : IconChevronRight
                                                        }
                                                        size="xs"
                                                    />
                                                    <Text
                                                        fw={500}
                                                        size="xs"
                                                        c="dark"
                                                        className={
                                                            classes.toolCallName
                                                        }
                                                    >
                                                        {toolCall.toolName ||
                                                            'Unknown'}
                                                    </Text>
                                                </Group>
                                            </Group>
                                        </Box>
                                        <Collapse in={isExpanded}>
                                            <Stack gap="sm" p="sm">
                                                {/* Tool Arguments */}
                                                {argsJson ? (
                                                    <Box>
                                                        <Text
                                                            fw={500}
                                                            size="xs"
                                                            c="dark"
                                                            mb="xs"
                                                        >
                                                            Arguments
                                                        </Text>
                                                        <Prism
                                                            language="json"
                                                            styles={{
                                                                code: {
                                                                    fontSize:
                                                                        '11px',
                                                                },
                                                            }}
                                                        >
                                                            {argsJson}
                                                        </Prism>
                                                    </Box>
                                                ) : (
                                                    <Box
                                                        p="sm"
                                                        className={
                                                            classes.centerText
                                                        }
                                                    >
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                            fs="italic"
                                                        >
                                                            Cannot display
                                                            arguments
                                                        </Text>
                                                    </Box>
                                                )}

                                                <ToolResults
                                                    toolCall={toolCall}
                                                    toolResult={toolResultsMap.get(
                                                        toolCall.toolCallId,
                                                    )}
                                                />
                                            </Stack>
                                        </Collapse>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </Box>
                )}

                {/* Empty state */}
                {!artifactData && (!toolCalls || toolCalls.length === 0) && (
                    <Box p="xl" className={classes.emptyState}>
                        <MantineIcon
                            icon={IconBug}
                            size={40}
                            color="gray"
                            className={classes.emptyStateIcon}
                        />
                        <Text c="dimmed" size="sm">
                            No debug information available
                        </Text>
                    </Box>
                )}
            </Stack>
        </Drawer>
    );
};

export default AgentChatDebugDrawer;
