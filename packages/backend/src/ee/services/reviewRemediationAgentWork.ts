import {
    AgentActorSurface,
    InvalidUser,
    type SessionUser,
} from '@lightdash/common';
import {
    assertAgentWorkUserActive,
    createAgentDeliveryGuard,
    parseAgentWorkMarker,
} from '../../services/AgentPermissionService/agentWorkAuthority';
import { WritebackAgentAccessError } from './AiWritebackService/errors';

export const createReviewRemediationAgentWorkGuard = (
    deps: Parameters<typeof assertAgentWorkUserActive>[0],
    payload: Record<string, unknown>,
) => {
    const agentWork = parseAgentWorkMarker(payload);
    if (agentWork.status === 'absent') return null;
    let freshlyLoadedUser: SessionUser | null = null;
    const guard = createAgentDeliveryGuard({
        enabled: true,
        now: Date.now,
        check: async () => {
            try {
                if (agentWork.status === 'malformed') {
                    throw new InvalidUser('Invalid agent work marker');
                }
                const user =
                    freshlyLoadedUser ??
                    (await deps.userModel.findSessionUserAndOrgByUuid(
                        agentWork.marker.userUuid,
                        agentWork.marker.organizationUuid,
                    ));
                await assertAgentWorkUserActive(
                    deps,
                    {
                        ...agentWork.marker,
                        surface: AgentActorSurface.IN_APP_AGENT,
                    },
                    user,
                );
            } catch (error) {
                throw new WritebackAgentAccessError(error);
            }
        },
    });
    return {
        ...guard,
        malformed: agentWork.status === 'malformed',
        assertUser: async (user: SessionUser) => {
            freshlyLoadedUser = user;
            try {
                await guard.assert();
            } finally {
                freshlyLoadedUser = null;
            }
        },
    };
};
