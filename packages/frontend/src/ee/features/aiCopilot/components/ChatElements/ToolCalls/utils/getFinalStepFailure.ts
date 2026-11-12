import {
    isToolEditDbtProjectResult,
    isToolName,
    type AiAgentMessageAssistant,
    type AiAgentToolResult,
} from '@lightdash/common';
import { type SqlRunnerLinkState } from '../../ContentLink';
import { isHiddenToolName } from '../../hiddenToolNames';
import { type LiveActivityToolGroup } from '../LiveActivityCard';
import {
    getComposerQueryNodes,
    isWarehouseSqlNode,
} from './composerQueryNodes';
import { getToolCallDisplayMessage } from './getToolCallDisplayMessage';
import { getMcpToolDisplayName } from './mcpToolDisplay';
import { getRunSqlLinkStateFromArgs } from './runSqlLinkState';
import { getToolCallFailures, type ToolCallFailure } from './toolCallFailure';
import { groupToolCallSummaries } from './toolCallGrouping';

export type FinalStepFailure = {
    stepLabel: string;
    failures: ToolCallFailure[];
    /** The failed warehouse SQL, to reopen in the SQL Runner. */
    sqlRunnerLinkState: SqlRunnerLinkState | null;
};

// Only a lone warehouse SQL node is unambiguous; DuckDB/Python nodes read other results.
const getSingleWarehouseSql = (
    toolArgs: unknown,
): SqlRunnerLinkState | null => {
    const nodes = getComposerQueryNodes(toolArgs);
    const [node] = nodes;
    if (nodes.length !== 1 || !isWarehouseSqlNode(node) || !('sql' in node)) {
        return null;
    }
    return typeof node.limit === 'number'
        ? { sql: node.sql, limit: node.limit }
        : { sql: node.sql };
};

/**
 * The failure the turn ended on. Failures the agent moved past (a later step
 * ran) stay in the activity card only, since it may have recovered.
 */
export const getFinalStepFailure = (
    toolGroups: LiveActivityToolGroup[],
    toolResults?: AiAgentToolResult[],
): FinalStepFailure | null => {
    const last = toolGroups[toolGroups.length - 1];
    if (!last) return null;
    const failures = getToolCallFailures(last.calls, toolResults);
    const lastCall = last.calls[last.calls.length - 1];
    // A dbt edit's own card says what went wrong, in words meant for the person.
    const lastResult = toolResults?.find(
        (result) => result.toolCallId === lastCall?.toolCallId,
    );
    if (lastResult && isToolEditDbtProjectResult(lastResult)) return null;
    // Grouping merges retries, so a group whose last call succeeded recovered.
    if (
        !lastCall ||
        !failures.some((f) => f.toolCallId === lastCall.toolCallId)
    )
        return null;
    const stepLabel =
        (isToolName(last.toolName)
            ? getToolCallDisplayMessage({
                  toolName: last.toolName,
                  calls: last.calls,
                  display: last.display,
                  status: 'done',
              })
            : getMcpToolDisplayName(last.toolName)) ?? last.toolName;
    const failedIds = new Set(failures.map((failure) => failure.toolCallId));
    const failedSql = last.calls
        .filter((call) => failedIds.has(call.toolCallId))
        .map((call) =>
            call.toolName === 'runSql'
                ? getRunSqlLinkStateFromArgs(call.toolArgs)
                : getSingleWarehouseSql(call.toolArgs),
        )
        .findLast((state) => state !== null);
    return { stepLabel, failures, sqlRunnerLinkState: failedSql ?? null };
};

/** The failure a finished, persisted assistant turn ended on. */
export const getMessageFinalStepFailure = (
    message: Pick<AiAgentMessageAssistant, 'toolCalls' | 'toolResults'>,
): FinalStepFailure | null =>
    getFinalStepFailure(
        groupToolCallSummaries(
            message.toolCalls.filter(
                (toolCall) =>
                    !isHiddenToolName(toolCall.toolName) &&
                    toolCall.parentToolCallId === null,
            ),
        ),
        message.toolResults,
    );
