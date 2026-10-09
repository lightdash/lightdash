import {
    getSameTurnSqlApprovalProgressId,
    isSqlApprovalToolCall,
} from '@lightdash/common';
import { type AiAgentThreadStreamingState } from '../../../../store/aiAgentThreadStreamSlice';
import {
    getComposerQueryNodes,
    isWarehouseSqlNode,
} from './composerQueryNodes';

// Composer gates only when it has warehouse SQL nodes; runSql always; content
// tools only when they save new SQL.
export const requiresSqlApproval = (
    toolName: string,
    toolArgs: unknown,
): boolean =>
    toolName === 'runComposerQueries'
        ? getComposerQueryNodes(toolArgs).some(isWarehouseSqlNode)
        : isSqlApprovalToolCall(toolName, toolArgs);

// Complete args, no result, no decision, and not skipped by the server for
// SQL approved earlier in the turn: the tool is waiting on the user.
export const getPendingApprovalIds = ({
    parts,
    decidedToolCallIds,
    stepProgressMessages,
}: Pick<
    AiAgentThreadStreamingState,
    'parts' | 'decidedToolCallIds' | 'stepProgressMessages'
>): string[] => {
    const progressIds = new Set(
        stepProgressMessages.map((message) => message.progressId),
    );
    return parts.flatMap((part) =>
        part.type !== 'text' &&
        !part.toolResult &&
        part.isArgsPartial !== true &&
        !decidedToolCallIds.includes(part.toolCallId) &&
        !progressIds.has(getSameTurnSqlApprovalProgressId(part.toolCallId)) &&
        requiresSqlApproval(part.toolName, part.toolArgs)
            ? [part.toolCallId]
            : [],
    );
};
