import { assertUnreachable, type ApiAiAgentResponse } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getAiAgentThreadPath } from '../../hooks/aiAgentRouting';
import { getProjectAiAgentQueryKey } from '../../hooks/useProjectAiAgents';
import { openPanel } from '../../store/aiAgentLauncherSlice';
import {
    useAiAgentStoreDispatch,
    useAiAgentStoreSelector,
} from '../../store/hooks';
import {
    getAwaitingSqlApprovals,
    getSqlApprovalNotificationClickAction,
    getSqlApprovalNotificationContent,
    type AwaitingSqlApproval,
} from '../../utils/sqlApprovalNotification';
import { isThreadSqlAutoApproved } from '../ChatElements/ToolCalls/useSqlAutoApprove';
import { useIsLauncherHidden } from './useIsLauncherHidden';

const canShowNotification = () =>
    document.visibilityState !== 'visible' &&
    'Notification' in window &&
    Notification.permission === 'granted';

/**
 * Notifies, while the tab is in the background, when a live agent turn waits
 * on the user's SQL approval. Each tool call is considered once.
 */
export const AiAgentSqlApprovalWatcher: FC = () => {
    const streams = useAiAgentStoreSelector(
        (state) => state.aiAgentThreadStream,
    );
    const launcherActiveThreadId = useAiAgentStoreSelector(
        (state) => state.aiAgentLauncher.activeThreadId,
    );
    const dispatch = useAiAgentStoreDispatch();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    // Mounted above the routes, outside any EmbedProvider
    const isEmbed = pathname.startsWith('/embed/');
    const isLauncherHidden = useIsLauncherHidden();
    const launcherThreadUuid = isLauncherHidden ? null : launcherActiveThreadId;
    const handledToolCallIdsRef = useRef(new Set<string>());

    const openThread = useCallback(
        ({ projectUuid, agentUuid, threadUuid }: AwaitingSqlApproval) => {
            const action = getSqlApprovalNotificationClickAction({
                threadUuid,
                pathname,
                launcherThreadUuid,
            });
            switch (action) {
                case 'focus':
                    return;
                case 'openLauncher':
                    dispatch(openPanel({ threadId: threadUuid, agentUuid }));
                    return;
                case 'navigate':
                    void navigate(
                        getAiAgentThreadPath(
                            projectUuid,
                            agentUuid,
                            threadUuid,
                            false,
                        ),
                    );
                    return;
                default:
                    return assertUnreachable(
                        action,
                        'Unknown notification click action',
                    );
            }
        },
        [dispatch, navigate, pathname, launcherThreadUuid],
    );
    const openThreadRef = useRef(openThread);
    openThreadRef.current = openThread;

    useEffect(() => {
        if (isEmbed) return;
        const handled = handledToolCallIdsRef.current;
        getAwaitingSqlApprovals(
            Object.values(streams),
            isThreadSqlAutoApproved,
        ).forEach((approval) => {
            if (handled.has(approval.toolCallId)) return;
            handled.add(approval.toolCallId);
            if (!canShowNotification()) return;

            const agent = queryClient.getQueryData<
                ApiAiAgentResponse['results']
            >(
                getProjectAiAgentQueryKey(
                    approval.projectUuid,
                    approval.agentUuid,
                ),
            );
            const content = getSqlApprovalNotificationContent(
                agent?.name ?? null,
            );
            const notification = new Notification(content.title, {
                body: content.body,
                icon: '/favicon.ico',
                tag: approval.toolCallId,
            });
            notification.onclick = () => {
                window.focus();
                notification.close();
                openThreadRef.current(approval);
            };
        });
    }, [streams, isEmbed, queryClient]);

    return null;
};
