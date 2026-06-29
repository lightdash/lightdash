import {
    isToolName,
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type AiAgentToolName,
    type ToolName,
} from '@lightdash/common';

const INTERNAL_TOOL_NAMES = ['listExplores', 'submitResult'] as const;

export type InternalToolName = (typeof INTERNAL_TOOL_NAMES)[number];
export type ActivityToolName = ToolName | InternalToolName;

const INTERNAL_TOOL_NAME_SET = new Set<string>(INTERNAL_TOOL_NAMES);

export const isInternalToolName = (
    toolName: AiAgentToolName,
): toolName is InternalToolName => INTERNAL_TOOL_NAME_SET.has(toolName);

export const isActivityToolName = (
    toolName: AiAgentToolName,
): toolName is ActivityToolName =>
    isToolName(toolName) || isInternalToolName(toolName);

const INTERNAL_TOOL_DISPLAY_MESSAGES: Record<
    InternalToolName,
    { running: string; done: string }
> = {
    listExplores: {
        running: 'Listing available explores',
        done: 'Listed available explores',
    },
    submitResult: {
        running: 'Picking best explore and fields',
        done: 'Picked best explore and fields',
    },
};

export const getActivityToolMessage = ({
    toolName,
    status,
}: {
    toolName: ActivityToolName;
    status: 'running' | 'done';
}) => {
    if (isInternalToolName(toolName)) {
        return INTERNAL_TOOL_DISPLAY_MESSAGES[toolName][status];
    }

    return status === 'running'
        ? TOOL_DISPLAY_MESSAGES[toolName]
        : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[toolName];
};
