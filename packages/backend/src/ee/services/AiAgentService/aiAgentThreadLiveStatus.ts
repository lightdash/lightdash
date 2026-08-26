import {
    type AiAgentThreadLiveStatus,
    type AiDeepResearchRunStatus,
} from '@lightdash/common';
import { AI_AGENT_THREAD_PENDING_TIMEOUT_MS } from '../../models/aiAgentConstants';
import { AI_DEEP_RESEARCH_STALE_RUN_THRESHOLD_MINUTES } from '../AiDeepResearchService/constants';

export type AiAgentThreadLiveStateSignals = {
    threadUuid: string;
    threadCreatedAt: Date;
    latestPrompt: {
        createdAt: Date;
        respondedAt: Date | null;
        response: string | null;
        errorMessage: string | null;
        interruptedAt: Date | null;
    } | null;
    runSqlToolCalls: {
        createdAt: Date;
        toolResultUuid: string | null;
        approvalDecision: 'approved' | 'rejected' | null;
    }[];
    pendingWritebackCreatedAt: Date | null;
    activeDeepResearchRun: {
        status: Extract<AiDeepResearchRunStatus, 'queued' | 'running'>;
        createdAt: Date;
        startedAt: Date | null;
    } | null;
};

const isLatestPromptNonTerminal = (
    latestPrompt: AiAgentThreadLiveStateSignals['latestPrompt'],
): latestPrompt is NonNullable<AiAgentThreadLiveStateSignals['latestPrompt']> =>
    latestPrompt !== null &&
    latestPrompt.response === null &&
    latestPrompt.errorMessage === null &&
    latestPrompt.interruptedAt === null;

const isLatestPromptAwaitingSqlApproval = (
    latestPrompt: AiAgentThreadLiveStateSignals['latestPrompt'],
): latestPrompt is NonNullable<AiAgentThreadLiveStateSignals['latestPrompt']> =>
    latestPrompt !== null &&
    latestPrompt.errorMessage === null &&
    latestPrompt.interruptedAt === null;

export const deriveAiAgentThreadLiveStatus = (
    signals: AiAgentThreadLiveStateSignals,
    now: Date = new Date(),
): AiAgentThreadLiveStatus => {
    const { latestPrompt } = signals;
    const pendingSqlApproval = signals.runSqlToolCalls
        .filter(
            (toolCall) =>
                toolCall.toolResultUuid === null &&
                toolCall.approvalDecision === null,
        )
        .sort(
            (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime(),
        )[0];

    if (
        isLatestPromptAwaitingSqlApproval(latestPrompt) &&
        pendingSqlApproval !== undefined
    ) {
        return {
            threadUuid: signals.threadUuid,
            state: 'waiting_for_you',
            stateChangedAt: pendingSqlApproval.createdAt.toISOString(),
            source: 'deterministic',
        };
    }

    if (signals.pendingWritebackCreatedAt !== null) {
        return {
            threadUuid: signals.threadUuid,
            state: 'working',
            stateChangedAt: signals.pendingWritebackCreatedAt.toISOString(),
            source: 'deterministic',
        };
    }

    if (
        isLatestPromptNonTerminal(latestPrompt) &&
        now.getTime() - latestPrompt.createdAt.getTime() <=
            AI_AGENT_THREAD_PENDING_TIMEOUT_MS
    ) {
        return {
            threadUuid: signals.threadUuid,
            state: 'working',
            stateChangedAt: latestPrompt.createdAt.toISOString(),
            source: 'deterministic',
        };
    }

    if (
        signals.activeDeepResearchRun !== null &&
        (signals.activeDeepResearchRun.status === 'running' ||
            now.getTime() - signals.activeDeepResearchRun.createdAt.getTime() <=
                AI_DEEP_RESEARCH_STALE_RUN_THRESHOLD_MINUTES * 60 * 1000)
    ) {
        return {
            threadUuid: signals.threadUuid,
            state: 'working',
            stateChangedAt: (
                signals.activeDeepResearchRun.startedAt ??
                signals.activeDeepResearchRun.createdAt
            ).toISOString(),
            source: 'deterministic',
        };
    }

    return {
        threadUuid: signals.threadUuid,
        state: 'idle',
        stateChangedAt: (
            signals.latestPrompt?.respondedAt ??
            signals.latestPrompt?.interruptedAt ??
            signals.threadCreatedAt
        ).toISOString(),
        source: 'deterministic',
    };
};
