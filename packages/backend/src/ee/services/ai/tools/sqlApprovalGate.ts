import {
    getSameTurnSqlApprovalProgressId,
    isSlackPrompt,
} from '@lightdash/common';
import type {
    GetPromptFn,
    IsThreadSqlAutoApprovedFn,
    ListSqlApprovalDecisionsFn,
    RecordSqlApprovalFn,
    StoreToolResultsFn,
    UpdateProgressFn,
    UpdateSlackMessageFn,
    WaitForSqlApprovalFn,
} from '../types/aiAgentDependencies';
import { renderBlocks, type SectionState } from './slackSqlAggregate';
import {
    findSameTurnSqlApproval,
    SqlNotApprovedError,
    type NativeSqlApprovalToolName,
    type SameTurnSqlApproval,
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
    listSqlApprovalDecisions: ListSqlApprovalDecisionsFn;
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

const SAME_TURN_APPROVED_PROGRESS = 'SQL already approved earlier in this turn';

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

    /** An approval of the same SQL by another call in this turn. */
    const fetchSameTurnApproval = async (
        toolCallId: string,
        sql: string,
    ): Promise<SameTurnSqlApproval | null> => {
        const prompt = await dependencies.getPrompt();
        return findSameTurnSqlApproval(
            await dependencies.listSqlApprovalDecisions(prompt.promptUuid),
            { toolCallId, sql },
        );
    };

    /**
     * For the AI SDK: whether a call suspends until the user approves it on
     * Slack. `sql` is null when the tool does not gate the call.
     */
    const needsNativeApproval = async ({
        toolCallId,
        sql,
    }: {
        toolCallId: string;
        sql: string | null;
    }): Promise<boolean> =>
        sql !== null &&
        (await usesNativeApproval()) &&
        (await fetchSameTurnApproval(toolCallId, sql)) === null;

    // `sql` mirrors `needsNativeApproval`: a natively gated call resumes an
    // earlier run, so its result must be persisted here.
    const forToolCall = async (
        toolCallId: string,
        { sql: gatedSql }: { sql: string | null },
    ) => {
        let resume = await needsNativeApproval({ toolCallId, sql: gatedSql });

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

        /** Records an agent or thread auto-approval; false when neither applies. */
        const recordAutoApproval = async (
            threadUuid: string,
        ): Promise<boolean> => {
            if (
                !dependencies.autoApproveSql &&
                !(await dependencies.isThreadSqlAutoApproved(threadUuid))
            ) {
                return false;
            }
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
            // A decision already recorded by the approval button means this
            // execution resumes an earlier run.
            if (!recorded) resume = true;
            return true;
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

            if (await recordAutoApproval(prompt.threadUuid)) return;

            const sameTurnApproval = await fetchSameTurnApproval(
                toolCallId,
                sql,
            );
            if (sameTurnApproval) {
                await dependencies.recordSqlApproval({
                    toolCallId,
                    toolName,
                    decidedByUserUuid: sameTurnApproval.decidedByUserUuid,
                    source: 'same_turn_approval',
                });
                if (!isSlack) {
                    await dependencies.updateProgress(
                        SAME_TURN_APPROVED_PROGRESS,
                        toolName,
                        getSameTurnSqlApprovalProgressId(toolCallId),
                        'complete',
                    );
                }
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

        /** A gated call whose SQL did not change: settles it without asking. */
        const settleUnchangedSql = async (): Promise<void> => {
            const prompt = await dependencies.getPrompt();
            await recordAutoApproval(prompt.threadUuid);
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

        return {
            approveSql,
            settleUnchangedSql,
            renderState,
            persistIfResumed,
        };
    };

    return { needsNativeApproval, forToolCall };
};

export type SqlApprovalCall = Awaited<
    ReturnType<ReturnType<typeof createSqlApprovalGate>['forToolCall']>
>;
