import {
    TOOL_DISPLAY_MESSAGES,
    TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL,
    type ReadContentType,
    type ToolName,
} from '@lightdash/common';
import i18n from '../../../../../../../i18n/i18n';
import { type ToolCallGroupDisplay } from './toolCallGrouping';
import { type ToolCallSummary } from './types';

export type ToolCallDisplayStatus = 'running' | 'done';

type ContentToolArgs = {
    type?: ReadContentType | 'document';
};

// Documents are read and written by the content tools but aren't a readContent type
const CONTENT_TYPE_LABEL_KEYS: Record<ReadContentType | 'document', string> = {
    dashboard: 'contentTool.types.dashboard',
    chart: 'contentTool.types.chart',
    sql_chart: 'contentTool.types.sqlChart',
    data_app: 'contentTool.types.dataApp',
    document: 'contentTool.types.document',
};

// Keys under `contentTool` in the aiCopilotChat namespace.
const CONTENT_TOOL_LABEL_KEYS: Partial<
    Record<ToolName, Record<ToolCallDisplayStatus, string>>
> = {
    readContent: { running: 'reading', done: 'read' },
    editContent: { running: 'editing', done: 'edited' },
    createContent: { running: 'creating', done: 'created' },
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
    const labelForTool = CONTENT_TOOL_LABEL_KEYS[toolName];
    if (!labelForTool) return null;

    const contentTypes = new Set(calls.map(getContentType).filter(Boolean));
    if (contentTypes.size !== 1) return null;

    const [contentType] = contentTypes;
    return contentType
        ? i18n.t(`contentTool.${labelForTool[status]}`, {
              ns: 'aiCopilotChat',
              type: i18n.t(CONTENT_TYPE_LABEL_KEYS[contentType], {
                  ns: 'aiCopilotChat',
              }),
          })
        : null;
};

export const getToolCallDisplayMessage = ({
    toolName,
    calls,
    display,
    status,
}: {
    toolName: ToolName;
    calls: ToolCallSummary[];
    display?: ToolCallGroupDisplay;
    status: ToolCallDisplayStatus;
}) => {
    if (display) {
        return status === 'running' ? display.liveLabel : display.doneLabel;
    }

    return (
        getContentToolDisplayMessage(toolName, calls, status) ??
        (status === 'running'
            ? TOOL_DISPLAY_MESSAGES[toolName]
            : TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL[toolName])
    );
};
