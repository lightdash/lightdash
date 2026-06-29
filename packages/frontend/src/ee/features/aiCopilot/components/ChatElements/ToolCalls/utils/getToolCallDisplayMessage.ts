import { isToolName, type ToolName } from '@lightdash/common';
import {
    getActivityToolMessage,
    type ActivityToolName,
} from './activityToolNames';
import { type ToolCallGroupDisplay } from './toolCallGrouping';
import { type ToolCallSummary } from './types';

export type ToolCallDisplayStatus = 'running' | 'done';

type ContentToolArgs = {
    type?: 'dashboard' | 'chart';
};

const CONTENT_TOOL_LABELS: Partial<
    Record<ToolName, Record<ToolCallDisplayStatus, (type: string) => string>>
> = {
    readContent: {
        running: (type) => `Reading ${type}`,
        done: (type) => `Read ${type}`,
    },
    editContent: {
        running: (type) => `Editing ${type}`,
        done: (type) => `Edited ${type}`,
    },
    createContent: {
        running: (type) => `Creating ${type}`,
        done: (type) => `Created ${type}`,
    },
};

const getContentType = (call: ToolCallSummary) => {
    const args = call.toolArgs as ContentToolArgs | undefined;
    return args?.type;
};

const getContentToolDisplayMessage = (
    toolName: ToolName,
    calls: ToolCallSummary[],
    status: ToolCallDisplayStatus,
) => {
    const labelForTool = CONTENT_TOOL_LABELS[toolName];
    if (!labelForTool) return null;

    const contentTypes = new Set(calls.map(getContentType).filter(Boolean));
    if (contentTypes.size !== 1) return null;

    const [contentType] = contentTypes;
    return contentType ? labelForTool[status](contentType) : null;
};

export const getToolCallDisplayMessage = ({
    toolName,
    calls,
    display,
    status,
}: {
    toolName: ActivityToolName;
    calls: ToolCallSummary[];
    display?: ToolCallGroupDisplay;
    status: ToolCallDisplayStatus;
}) => {
    if (display) {
        return status === 'running' ? display.liveLabel : display.doneLabel;
    }

    return (
        (isToolName(toolName)
            ? getContentToolDisplayMessage(toolName, calls, status)
            : null) ?? getActivityToolMessage({ toolName, status })
    );
};
