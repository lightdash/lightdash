import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { getEmbedExploreSearch } from '../../embed/embedNavigation';
import {
    getEmbedAiAgentDashboardPath,
    isEmbedAiAgentRoute,
} from './aiAgentRouting';

/**
 * Inside an embedded AI agent the full app is unreachable, so a saved
 * dashboard opens on the embed's own route with the conversation as the
 * return URL. Null outside an embed, where callers keep their app links.
 */
export const useEmbedAiAgentDashboardOpener = (
    projectUuid: string | undefined,
) => {
    const navigate = useNavigate();
    const { pathname, search } = useLocation();
    const { agentUuid } = useParams<{ agentUuid: string }>();
    const isEmbed = isEmbedAiAgentRoute();

    const open = useCallback(
        (dashboardUuid: string) => {
            if (!agentUuid || !projectUuid) {
                return;
            }
            const backUrl = `${pathname}${search}`;
            void navigate(
                {
                    pathname: getEmbedAiAgentDashboardPath(
                        projectUuid,
                        agentUuid,
                        dashboardUuid,
                    ),
                    search: getEmbedExploreSearch('', backUrl),
                },
                { state: { embedBackUrl: backUrl } },
            );
        },
        [agentUuid, navigate, pathname, projectUuid, search],
    );

    return isEmbed && agentUuid && projectUuid ? open : null;
};
