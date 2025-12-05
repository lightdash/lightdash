import {
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    ToolNameSchema,
} from '@lightdash/common';
import { Paper, Stack, Text, Timeline } from '@mantine-8/core';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import ErrorBoundary from '../../../../../../features/errorBoundary/ErrorBoundary';
import { ToolCallDescription } from './descriptions/ToolCallDescription';
import { ImproveContextToolCall } from './ImproveContextToolCall';
import { ToolCallContainer } from './ToolCallContainer';
import { getContainerMetadata } from './utils/getContainerMetadata';
import { getToolIcon } from './utils/toolIcons';
import type { ToolCallDisplayType, ToolCallSummary } from './utils/types';

type AiChartToolCallsProps = {
    toolCalls: ToolCallSummary[] | undefined;
    type: ToolCallDisplayType;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
};

const EXCLUDED_TOOL_NAMES = ['improveContext', 'proposeChange'];

export const AiChartToolCalls: FC<AiChartToolCallsProps> = ({
    toolCalls,
    type,
    projectUuid,
    agentUuid,
    threadUuid,
    promptUuid,
}) => {
    const texts =
        type === 'streaming'
            ? TOOL_DISPLAY_MESSAGES
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL;

    const calculationToolCalls = toolCalls?.filter(
        (toolCall) => !EXCLUDED_TOOL_NAMES.includes(toolCall.toolName),
    );

    if (!toolCalls || toolCalls.length === 0) return null;

    const { title, icon } = getContainerMetadata(calculationToolCalls, type);

    return (
        <ErrorBoundary>
            {projectUuid && agentUuid && threadUuid && (
                <ImproveContextToolCall
                    projectUuid={projectUuid}
                    agentUuid={agentUuid}
                    threadUuid={threadUuid}
                    promptUuid={promptUuid}
                />
            )}
            {!!calculationToolCalls?.length && (
                <ToolCallContainer
                    defaultOpened={type !== 'persisted'}
                    title={title}
                    isStreaming={type === 'streaming'}
                    icon={icon}
                >
                    <Stack pt="xs">
                        <Timeline
                            active={calculationToolCalls.length - 1}
                            bulletSize={16}
                            lineWidth={1}
                            color="gray"
                        >
                            {calculationToolCalls.map((toolCall) => {
                                const toolNameParsed = ToolNameSchema.safeParse(
                                    toolCall.toolName,
                                );
                                if (!toolNameParsed.success) {
                                    return null;
                                }

                                const toolName = toolNameParsed.data;
                                const IconComponent = getToolIcon(toolName);

                                return (
                                    <Timeline.Item
                                        key={toolCall.toolCallId}
                                        radius="sm"
                                        bullet={
                                            <Paper
                                                bg="ldGray.0"
                                                p="two"
                                                radius="sm"
                                                shadow="subtle"
                                            >
                                                <MantineIcon
                                                    icon={IconComponent}
                                                    size={12}
                                                    stroke={1.8}
                                                    color="indigo.3"
                                                />
                                            </Paper>
                                        }
                                        mt="xs"
                                        title={
                                            <Text
                                                fw={400}
                                                size="xs"
                                                c="ldGray.7"
                                            >
                                                {texts[toolName]}
                                            </Text>
                                        }
                                        lineVariant={'dashed'}
                                    >
                                        <ToolCallDescription
                                            toolName={toolName}
                                            toolCall={toolCall}
                                        />
                                    </Timeline.Item>
                                );
                            })}
                        </Timeline>
                    </Stack>
                </ToolCallContainer>
            )}
        </ErrorBoundary>
    );
};
