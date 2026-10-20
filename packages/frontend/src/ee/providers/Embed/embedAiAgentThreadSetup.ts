import {
    assertUnreachable,
    type AiThreadBinding,
    type ApiAiAgentThreadCreateRequest,
} from '@lightdash/common';

/** Applied to threads started from an embedded agent; existing threads keep their own. */
export type EmbedAiAgentThreadSetup = {
    binding: AiThreadBinding | null;
    threadContext: string | null;
};

const BOUND_DASHBOARD_UUID_PARAM = 'boundDashboardUuid';
const THREAD_CONTEXT_PARAM = 'threadContext';

export const getEmbedAiAgentThreadSetup = ({
    binding,
    threadContext,
}: {
    binding: AiThreadBinding | undefined;
    threadContext: string | undefined;
}): EmbedAiAgentThreadSetup | null =>
    binding || threadContext
        ? { binding: binding ?? null, threadContext: threadContext || null }
        : null;

// The setup rides in the hash after the token, so it never reaches server logs
export const buildEmbedHash = (
    token: string,
    setup: EmbedAiAgentThreadSetup | null,
): string => {
    const params = new URLSearchParams();
    if (setup?.binding) {
        const { binding } = setup;
        switch (binding.type) {
            case 'dashboard':
                params.set(BOUND_DASHBOARD_UUID_PARAM, binding.dashboardUuid);
                break;
            default:
                return assertUnreachable(
                    binding.type,
                    'Unknown thread binding type',
                );
        }
    }
    if (setup?.threadContext) {
        params.set(THREAD_CONTEXT_PARAM, setup.threadContext);
    }
    const query = params.toString();
    return query ? `${token}&${query}` : token;
};

export const parseEmbedHash = (
    hash: string,
): { token: string; aiAgentThreadSetup: EmbedAiAgentThreadSetup | null } => {
    const fragment = hash.replace(/^#/, '');
    const separatorIndex = fragment.indexOf('&');
    if (separatorIndex === -1) {
        return { token: fragment, aiAgentThreadSetup: null };
    }

    const params = new URLSearchParams(fragment.slice(separatorIndex + 1));
    const dashboardUuid = params.get(BOUND_DASHBOARD_UUID_PARAM);
    return {
        token: fragment.slice(0, separatorIndex),
        aiAgentThreadSetup: getEmbedAiAgentThreadSetup({
            binding: dashboardUuid
                ? { type: 'dashboard', dashboardUuid }
                : undefined,
            threadContext: params.get(THREAD_CONTEXT_PARAM) ?? undefined,
        }),
    };
};

export const getThreadSetupRequestFields = (
    setup: EmbedAiAgentThreadSetup | null,
): Pick<ApiAiAgentThreadCreateRequest, 'binding' | 'threadContext'> => ({
    binding: setup?.binding ?? undefined,
    threadContext: setup?.threadContext ?? undefined,
});
