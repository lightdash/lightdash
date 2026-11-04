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
const BOUND_CHART_UUID_PARAM = 'boundChartUuid';
const THREAD_CONTEXT_PARAM = 'threadContext';
const DISABLE_NAVIGATION_PARAM = 'disableNavigation';

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
    navigationDisabled: boolean,
): string => {
    const params = new URLSearchParams();
    if (setup?.binding) {
        const { binding } = setup;
        switch (binding.type) {
            case 'dashboard':
                params.set(BOUND_DASHBOARD_UUID_PARAM, binding.dashboardUuid);
                break;
            case 'chart':
                params.set(BOUND_CHART_UUID_PARAM, binding.chartUuid);
                break;
            default:
                return assertUnreachable(
                    binding,
                    'Unknown thread binding type',
                );
        }
    }
    if (setup?.threadContext) {
        params.set(THREAD_CONTEXT_PARAM, setup.threadContext);
    }
    if (navigationDisabled) {
        params.set(DISABLE_NAVIGATION_PARAM, 'true');
    }
    const query = params.toString();
    return query ? `${token}&${query}` : token;
};

const parseBinding = (params: URLSearchParams): AiThreadBinding | undefined => {
    const dashboardUuid = params.get(BOUND_DASHBOARD_UUID_PARAM);
    if (dashboardUuid) return { type: 'dashboard', dashboardUuid };
    const chartUuid = params.get(BOUND_CHART_UUID_PARAM);
    if (chartUuid) return { type: 'chart', chartUuid };
    return undefined;
};

export const parseEmbedHash = (
    hash: string,
): {
    token: string;
    aiAgentThreadSetup: EmbedAiAgentThreadSetup | null;
    aiAgentNavigationDisabled: boolean;
} => {
    const fragment = hash.replace(/^#/, '');
    const separatorIndex = fragment.indexOf('&');
    if (separatorIndex === -1) {
        return {
            token: fragment,
            aiAgentThreadSetup: null,
            aiAgentNavigationDisabled: false,
        };
    }

    const params = new URLSearchParams(fragment.slice(separatorIndex + 1));
    return {
        token: fragment.slice(0, separatorIndex),
        aiAgentThreadSetup: getEmbedAiAgentThreadSetup({
            binding: parseBinding(params),
            threadContext: params.get(THREAD_CONTEXT_PARAM) ?? undefined,
        }),
        aiAgentNavigationDisabled:
            params.get(DISABLE_NAVIGATION_PARAM) === 'true',
    };
};

export const getThreadSetupRequestFields = (
    setup: EmbedAiAgentThreadSetup | null,
): Pick<ApiAiAgentThreadCreateRequest, 'binding' | 'threadContext'> => ({
    binding: setup?.binding ?? undefined,
    threadContext: setup?.threadContext ?? undefined,
});
