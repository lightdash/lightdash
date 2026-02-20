import type { AgentCodingSessionMessage } from '@lightdash/common';
import { Box, Group, Paper, Text, ThemeIcon } from '@mantine-8/core';
import { IconTool } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import type { FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import type { StreamSegment, ToolCall } from '../hooks/useAgentCodingStream';
import classes from './AgentCodingChatBubbles.module.css';

interface UserBubbleProps {
    message: AgentCodingSessionMessage;
}

export const AgentCodingUserBubble: FC<UserBubbleProps> = ({ message }) => {
    return (
        <Box style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Paper p="md" withBorder bg="blue.0" maw="75%">
                <Text size="sm">{message.content}</Text>
            </Paper>
        </Box>
    );
};

interface AssistantBubbleProps {
    message?: AgentCodingSessionMessage;
    streamSegments?: StreamSegment[];
    isStreaming?: boolean;
}

const toolDisplayNames: Record<string, string> = {
    Bash: 'Running command',
    Read: 'Reading file',
    Edit: 'Editing file',
    Write: 'Writing file',
    Grep: 'Searching',
    Glob: 'Finding files',
};

// Extract a short description from tool input JSON
const getToolDescription = (toolName: string, input: string): string | null => {
    if (!input) return null;

    try {
        const parsed = JSON.parse(input);

        switch (toolName) {
            case 'Read':
            case 'Edit':
            case 'Write': {
                const filePath = parsed.file_path;
                if (filePath) {
                    // Extract just the filename from the path
                    const fileName = filePath.split('/').pop() || filePath;
                    return fileName;
                }
                return null;
            }
            case 'Bash': {
                const command = parsed.command;
                if (command) {
                    // Truncate long commands
                    const truncated =
                        command.length > 40
                            ? `${command.slice(0, 40)}...`
                            : command;
                    return truncated;
                }
                return null;
            }
            case 'Grep': {
                const pattern = parsed.pattern;
                if (pattern) {
                    return `"${pattern}"`;
                }
                return null;
            }
            case 'Glob': {
                const pattern = parsed.pattern;
                if (pattern) {
                    return pattern;
                }
                return null;
            }
            default:
                return null;
        }
    } catch {
        // Input might be partial/incomplete JSON during streaming
        return null;
    }
};

const ToolIndicator: FC<{ tool: ToolCall; isActive: boolean }> = ({
    tool,
    isActive,
}) => {
    const displayName = toolDisplayNames[tool.toolName] ?? tool.toolName;
    const description = getToolDescription(tool.toolName, tool.input);

    return (
        <Group gap="xs" className={classes.toolIndicator}>
            <ThemeIcon size="xs" variant="light" color="gray">
                <MantineIcon icon={IconTool} />
            </ThemeIcon>
            <Text
                size="xs"
                c={isActive ? undefined : 'dimmed'}
                className={
                    isActive
                        ? `${classes.toolName} ${classes.toolNameShimmer}`
                        : classes.toolName
                }
            >
                {displayName}
                {description && (
                    <Text span c="dimmed" inherit>
                        {' '}
                        {description}
                    </Text>
                )}
            </Text>
            {isActive && !tool.isComplete && (
                <div className={classes.toolSpinner} />
            )}
        </Group>
    );
};

export const AgentCodingAssistantBubble: FC<AssistantBubbleProps> = ({
    message,
    streamSegments = [],
    isStreaming = false,
}) => {
    // If we have a saved message, just render it
    if (message?.content) {
        return (
            <MDEditor.Markdown
                source={message.content}
                className={classes.markdown}
            />
        );
    }

    // Show thinking dots when streaming but no segments yet
    if (isStreaming && streamSegments.length === 0) {
        return (
            <div className={classes.thinkingDots}>
                <div className={classes.dot} />
                <div className={classes.dot} />
                <div className={classes.dot} />
            </div>
        );
    }

    if (streamSegments.length === 0) {
        return null;
    }

    // Render interleaved segments
    return (
        <Box>
            {streamSegments.map((segment, index) => {
                const isLast = index === streamSegments.length - 1;

                if (segment.type === 'text') {
                    return (
                        <MDEditor.Markdown
                            key={index}
                            source={segment.content}
                            className={classes.markdown}
                        />
                    );
                }

                // Tool segment - active if it's the last segment and not complete
                const isActive = isLast && !segment.tool.isComplete;
                return (
                    <ToolIndicator
                        key={segment.tool.toolUseId}
                        tool={segment.tool}
                        isActive={isActive}
                    />
                );
            })}
        </Box>
    );
};
