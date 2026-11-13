import { parseAskUserCall } from '@lightdash/common';
import { getPendingApprovalIds } from '../components/ChatElements/ToolCalls/utils/sqlApprovalPending';
import { getThreadUuidFromPathname } from '../hooks/aiAgentRouting';
import {
    isAiAgentThreadStreamActive,
    type AiAgentThreadStreamingState,
} from '../store/aiAgentThreadStreamSlice';

/** Asks once, on a user gesture, so a later approval can notify in the background. */
export const requestSqlApprovalNotificationPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission();
    }
};

export const getSqlApprovalNotificationContent = (
    agentName: string | null,
): { title: string; body: string } => ({
    title: 'Approval needed',
    body: agentName || 'AI agent',
});

export const getQuestionNotificationContent = (
    agentName: string | null,
): { title: string; body: string } => ({
    title: 'Question for you',
    body: agentName || 'AI agent',
});

export type SqlApprovalNotificationClickAction =
    | 'focus'
    | 'openLauncher'
    | 'navigate';

/** Where a notification click takes the user so the thread's approval is in view. */
export const getSqlApprovalNotificationClickAction = ({
    threadUuid,
    pathname,
    launcherThreadUuid,
}: {
    threadUuid: string;
    pathname: string;
    // The launcher's active thread, or null when this page shows no launcher.
    launcherThreadUuid: string | null;
}): SqlApprovalNotificationClickAction => {
    if (getThreadUuidFromPathname(pathname) === threadUuid) return 'focus';
    if (launcherThreadUuid === threadUuid) return 'openLauncher';
    return 'navigate';
};

export type AwaitingUserInput = {
    toolCallId: string;
    threadUuid: string;
    projectUuid: string;
    agentUuid: string;
};

/** Tool calls in live streams the user must approve; auto-approved threads excluded. */
export const getAwaitingSqlApprovals = (
    streams: AiAgentThreadStreamingState[],
    isThreadAutoApproved: (threadUuid: string) => boolean,
): AwaitingUserInput[] =>
    streams
        .filter(
            (stream) =>
                isAiAgentThreadStreamActive(stream.connection) &&
                !stream.autoApproveSql &&
                !isThreadAutoApproved(stream.threadUuid),
        )
        .flatMap(({ threadUuid, projectUuid, agentUuid, ...stream }) =>
            getPendingApprovalIds(stream).map((toolCallId) => ({
                toolCallId,
                threadUuid,
                projectUuid,
                agentUuid,
            })),
        );

/** askUser calls in live streams: the turn ends waiting on the user's answer. */
export const getAwaitingQuestions = (
    streams: AiAgentThreadStreamingState[],
): AwaitingUserInput[] =>
    streams
        .filter((stream) => isAiAgentThreadStreamActive(stream.connection))
        .flatMap(({ threadUuid, projectUuid, agentUuid, parts }) =>
            parts.flatMap((part) =>
                part.type === 'toolCall' &&
                part.isArgsPartial !== true &&
                parseAskUserCall(part.toolName, part.toolArgs) !== null
                    ? [
                          {
                              toolCallId: part.toolCallId,
                              threadUuid,
                              projectUuid,
                              agentUuid,
                          },
                      ]
                    : [],
            ),
        );
