import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import useIsEmbedded from '../../../providers/Embed/useIsEmbedded';
import { getEmbedExploreSearch } from '../../embed/embedNavigation';
import { getEmbedAiAgentDashboardPath } from './aiAgentRouting';
import { useChatBackUrl } from './useChatBackUrl';

/**
 * Inside an embedded AI agent the full app is unreachable, so a saved
 * dashboard opens on the embed's own route with the conversation as the
 * return URL. Null outside an embed, where callers keep their app links.
 */
export const useEmbedAiAgentDashboardOpener = (
    projectUuid: string | undefined,
) => {
    const navigate = useNavigate();
    const getBackUrl = useChatBackUrl();
    const { agentUuid } = useParams<{ agentUuid: string }>();
    const isEmbed = useIsEmbedded();

    const open = useCallback(
        (dashboardUuid: string, anchorId: string | null) => {
            if (!agentUuid || !projectUuid) {
                return;
            }
            const backUrl = getBackUrl(anchorId);
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
        [agentUuid, getBackUrl, navigate, projectUuid],
    );

    return isEmbed && agentUuid && projectUuid ? open : null;
};
