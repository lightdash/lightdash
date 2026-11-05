import { InvalidUser } from '@lightdash/common';
import {
    assertAgentWorkAllowed,
    assertAgentWorkUserActive,
    createAgentDeliveryGuard,
    type ParsedAgentWorkMarker,
} from '../../../services/AgentPermissionService/agentWorkAuthority';
import { WritebackAgentAccessError } from './errors';

export const createWritebackAgentDeliveryGuard = (
    deps: Parameters<typeof assertAgentWorkAllowed>[0],
    agentWork: ParsedAgentWorkMarker,
    work: Pick<Parameters<typeof assertAgentWorkAllowed>[1], 'surface'> & {
        operation: NonNullable<
            Parameters<typeof assertAgentWorkAllowed>[1]['operation']
        >;
        agentPermissionsApply: boolean;
    },
) => {
    if (agentWork.status === 'absent') return null;
    return createAgentDeliveryGuard({
        enabled: true,
        check: async () => {
            try {
                if (agentWork.status === 'malformed') {
                    throw new InvalidUser('Invalid agent work marker');
                }
                const authority = {
                    ...agentWork.marker,
                    surface: work.surface,
                    operation: work.operation,
                };
                if (work.agentPermissionsApply) {
                    await assertAgentWorkAllowed(deps, authority);
                } else {
                    const user =
                        await deps.userModel.findSessionUserAndOrgByUuid(
                            authority.userUuid,
                            authority.organizationUuid,
                        );
                    await assertAgentWorkUserActive(deps, authority, user);
                }
            } catch (error) {
                throw new WritebackAgentAccessError(error);
            }
        },
        now: Date.now,
    });
};
