import { AiAccessRefusedError, InvalidUser } from '@lightdash/common';
import {
    assertAgentWorkAllowed,
    assertAgentWorkUserActive,
    createAgentDeliveryGuard,
} from '../../../services/AgentPermissionService/agentWorkAuthority';

export const AUTOPILOT_AUTHORITY_REFUSED_MESSAGE =
    'Run blocked: the person who enabled Autopilot can no longer run agents. Another admin can enable it again.';

export const AUTOPILOT_AUTHORITY_CHECK_FAILED_MESSAGE =
    'Run blocked: the access check could not run.';

export const isAutopilotAuthorityRefusal = (error: unknown): boolean =>
    error instanceof AiAccessRefusedError || error instanceof InvalidUser;

export const getAutopilotAuthorityError = (error: unknown): string =>
    isAutopilotAuthorityRefusal(error)
        ? AUTOPILOT_AUTHORITY_REFUSED_MESSAGE
        : AUTOPILOT_AUTHORITY_CHECK_FAILED_MESSAGE;

export const createAutopilotAuthority = (
    deps: Parameters<typeof assertAgentWorkAllowed>[0],
    work: Parameters<typeof assertAgentWorkAllowed>[1],
) => {
    const controller = new AbortController();
    let toolFailure: { error: unknown } | null = null;
    const guard = createAgentDeliveryGuard({
        enabled: true,
        check: () => {
            if (toolFailure) throw toolFailure.error;
            return assertAgentWorkAllowed(deps, work);
        },
        now: Date.now,
    });
    const check = async (force: boolean): Promise<void> => {
        try {
            if (force) await guard.assert();
            else await guard.assertIfStale();
        } catch (error) {
            controller.abort(new Error(getAutopilotAuthorityError(error)));
            throw error;
        }
    };
    return {
        guard,
        abortSignal: controller.signal,
        assert: () => check(true),
        assertIfStale: () => check(false),
        loadToolUser: async () => {
            controller.signal.throwIfAborted();
            try {
                const user = await deps.userModel.findSessionUserAndOrgByUuid(
                    work.userUuid,
                    work.organizationUuid,
                );
                await assertAgentWorkUserActive(deps, work, user);
                await check(false);
                return user;
            } catch (error) {
                toolFailure ??= { error };
                await check(true);
                throw error;
            }
        },
    };
};

export type AutopilotAuthority = ReturnType<typeof createAutopilotAuthority>;
