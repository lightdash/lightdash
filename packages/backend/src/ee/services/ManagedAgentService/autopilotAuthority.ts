import {
    AiAccessRefusedError,
    InvalidUser,
    type SessionUser,
} from '@lightdash/common';
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
    options: {
        initialFailure: { error: unknown } | null;
        onFailure: (error: unknown) => void;
    },
) => {
    const controller = new AbortController();
    let toolFailure = options.initialFailure;
    let inFlightCheck: ReturnType<typeof assertAgentWorkAllowed> | null = null;
    const guard = createAgentDeliveryGuard({
        enabled: true,
        check: () => {
            if (toolFailure) throw toolFailure.error;
            inFlightCheck ??= assertAgentWorkAllowed(deps, work).finally(() => {
                inFlightCheck = null;
            });
            return inFlightCheck;
        },
        now: Date.now,
    });
    const check = async (force: boolean): Promise<void> => {
        try {
            if (force) await guard.assert();
            else await guard.assertIfStale();
        } catch (error) {
            if (!controller.signal.aborted) {
                controller.abort(new Error(getAutopilotAuthorityError(error)));
                if (!isAutopilotAuthorityRefusal(error))
                    options.onFailure(error);
            }
            throw error;
        }
    };
    return {
        guard,
        isStoppingError: (error: unknown): boolean => {
            const failure = guard.getFailure();
            return (
                failure !== null &&
                (error === failure.error || error === controller.signal.reason)
            );
        },
        abortSignal: controller.signal,
        assert: () => check(true),
        assertIfStale: () => check(false),
        loadToolUser: async () => {
            controller.signal.throwIfAborted();
            let user: SessionUser;
            try {
                user = await deps.userModel.findSessionUserAndOrgByUuid(
                    work.userUuid,
                    work.organizationUuid,
                );
            } catch (error) {
                await check(true);
                throw error;
            }
            try {
                await assertAgentWorkUserActive(deps, work, user);
            } catch (error) {
                toolFailure ??= { error };
                await check(true);
                throw error;
            }
            await check(false);
            return user;
        },
    };
};

export type AutopilotAuthority = ReturnType<typeof createAutopilotAuthority>;
