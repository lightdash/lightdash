import { isSlackPrompt } from '@lightdash/common';
import type {
    GetPromptFn,
    IsThreadSqlAutoApprovedFn,
    RecordSqlApprovalFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { renderBlocks, type SectionState } from './slackSqlAggregate';
import {
    SqlNotApprovedError,
    type NativeSqlApprovalToolName,
    type TrackSqlApprovalTimeoutFn,
} from './sqlApprovals';

export type SqlApprovalDependencies = {
    getPrompt: GetPromptFn;
    updateProgress: UpdateProgressFn;
    updateSlackMessage: UpdateSlackMessageFn;
    siteUrl: string;
    waitForSqlApproval: WaitForSqlApprovalFn;
    recordSqlApproval: RecordSqlApprovalFn;
    isThreadSqlAutoApproved: IsThreadSqlAutoApprovedFn;
    trackSqlApprovalTimeout: TrackSqlApprovalTimeoutFn;
    // Persists results of resumed calls, which onStepFinish never sees.
    storeToolResults: StoreToolResultsFn;
    autoApproveSql: boolean;
    autoApproveSqlUserUuid: string | null;
    useSlackStreamCard: boolean;
};

/** Tool-specific wording for the approval states. */
export type SqlApprovalCopy = {
    slackText: string;
    pendingProgress: string;
    // Web progress once the user approves; null when the tool reports its own.
    approvedProgress: string | null;
    rejectedResult: string;
    timeoutResult: string;
    previousTimeoutResult: string;
};

type ToolOutput = { result: string; metadata?: Record<string, unknown> };

/**
 * One per tool instance: approval state spans the calls of a response.
 * Covers auto-approval, Slack native approval and the blocking wait.
 */
export const createSqlApprovalGate = (
    dependencies: SqlApprovalDependencies,
    toolName: NativeSqlApprovalToolName,
    copy: SqlApprovalCopy,
) => {
    let timedOut = false;

    const usesNativeApproval = async (): Promise<boolean> => {
        if (!dependencies.useSlackStreamCard || dependencies.autoApproveSql) {
            return false;
        }
        const prompt = await dependencies.getPrompt();
        return (
            isSlackPrompt(prompt) &&
            !(await dependencies.isThreadSqlAutoApproved(prompt.threadUuid))
        );
    };

    // `needsApproval` mirrors the tool's: a natively gated call resumes an
    // earlier run, so its result must be persisted here.
    const forToolCall = async (
        toolCallId: string,
        { needsApproval }: { needsApproval: boolean },
    ) => {
        let resume = needsApproval && (await usesNativeApproval());

        const renderState = async (state: SectionState) => {
            const prompt = await dependencies.getPrompt();
            if (!isSlackPrompt(prompt)) return;
            // The modern card shows progress itself; only approval buttons
            // still need the legacy message.
            if (dependencies.useSlackStreamCard && state.kind !== 'pending') {
                return;
            }
            await dependencies.updateSlackMessage({
                channelId: prompt.slackChannelId,
                organizationUuid: prompt.organizationUuid,
                ts: prompt.response_slack_ts,
                text: copy.slackText,
                blocks: renderBlocks(state, dependencies.siteUrl),
            });
        };

        /** Resolves once approved; throws SqlNotApprovedError otherwise. */
        const approveSql = async ({
            sql,
            heading,
        }: {
            sql: string;
            heading: string;
        }): Promise<void> => {
            if (timedOut) {
                throw new SqlNotApprovedError(
                    'timeout',
                    copy.previousTimeoutResult,
                );
            }
            const prompt = await dependencies.getPrompt();
            const isSlack = isSlackPrompt(prompt);

            if (
                dependencies.autoApproveSql ||
                (await dependencies.isThreadSqlAutoApproved(prompt.threadUuid))
            ) {
                const recorded = await dependencies.recordSqlApproval({
                    toolCallId,
                    toolName,
                    decidedByUserUuid: dependencies.autoApproveSql
                        ? dependencies.autoApproveSqlUserUuid
                        : null,
                    source: dependencies.autoApproveSql
                        ? 'auto_approve'
                        : 'thread_auto_approve',
                });
                // A decision already recorded by the approval button means
                // this execution resumes an earlier run.
                if (!recorded) resume = true;
                return;
            }

            if (await usesNativeApproval()) {
                // The SDK only executes this call once the user approved it.
                resume = true;
                return;
            }

            if (isSlack) {
                await renderState({
                    kind: 'pending',
                    sql,
                    toolCallId,
                    threadUuid: prompt.threadUuid,
                    heading,
                });
            } else {
                await dependencies.updateProgress(copy.pendingProgress);
            }

            const decision = await dependencies.waitForSqlApproval(toolCallId);
            if (decision === 'rejected') {
                await renderState({ kind: 'rejected', sql });
                throw new SqlNotApprovedError('rejected', copy.rejectedResult);
            }
            if (decision === 'timeout') {
                timedOut = true;
                dependencies.trackSqlApprovalTimeout({
                    toolCallId,
                    toolName,
                    promptedUserUuid: prompt.createdByUserUuid,
                    source: isSlack ? 'slack' : 'web',
                });
                await renderState({ kind: 'timeout', sql });
                throw new SqlNotApprovedError('timeout', copy.timeoutResult);
            }
            if (copy.approvedProgress !== null) {
                await dependencies.updateProgress(copy.approvedProgress);
            }
        };

        /** Stores the result of a resumed call; onStepFinish never sees it. */
        const persistIfResumed = async <T extends ToolOutput>(
            output: T,
        ): Promise<T> => {
            if (!resume) return output;
            const prompt = await dependencies.getPrompt();
            await dependencies
                .storeToolResults([
                    {
                        promptUuid: prompt.promptUuid,
                        toolCallId,
                        toolName,
                        result: output.result,
                        metadata: output.metadata,
                    },
                ])
                .catch(() => {
                    // Best-effort; the model already has the result.
                });
            return output;
        };

        return { approveSql, renderState, persistIfResumed };
    };

    return { usesNativeApproval, forToolCall };
};
