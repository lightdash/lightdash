import {
    AiIdentityFailureReason,
    AiIdentitySort,
    AiIdentityState,
    type AiIdentityFilter,
} from '@lightdash/common';

export type AiIdentityTab = 'triage' | 'setup' | 'automation' | 'request-log';

const tabs: AiIdentityTab[] = ['triage', 'setup', 'automation', 'request-log'];
const states = new Set<string>(Object.values(AiIdentityState));
const reasons = new Set<string>(Object.values(AiIdentityFailureReason));

export const getAiIdentityTab = (params: URLSearchParams): AiIdentityTab => {
    const tab = params.get('tab');
    return tabs.find((item) => item === tab) ?? 'triage';
};

export const getAiIdentityFilter = (
    params: URLSearchParams,
    aiIdentityAccountUuid: string,
    search: string,
): AiIdentityFilter => ({
    aiIdentityAccountUuid,
    states: params
        .getAll('state')
        .filter((state): state is AiIdentityState => states.has(state)),
    reasons: params
        .getAll('reason')
        .filter((reason): reason is AiIdentityFailureReason =>
            reasons.has(reason),
        ),
    projectUuid: params.get('project'),
    search: search.trim() || null,
    staleOnly: params.get('stale') === 'true',
});

export const getAiIdentitySort = (params: URLSearchParams): AiIdentitySort => {
    const sort = params.get('sort');
    return (
        Object.values(AiIdentitySort).find((value) => value === sort) ??
        AiIdentitySort.SEVERITY
    );
};

export const getAiIdentityListParams = (
    filter: AiIdentityFilter,
    sort: AiIdentitySort,
    page: number,
): URLSearchParams => {
    const params = new URLSearchParams({
        aiIdentityAccountUuid: filter.aiIdentityAccountUuid,
        sort,
        order: 'asc',
        page: String(page),
        pageSize: '50',
    });
    filter.states.forEach((state) => params.append('state', state));
    filter.reasons.forEach((reason) => params.append('reason', reason));
    if (filter.projectUuid) params.set('projectUuid', filter.projectUuid);
    if (filter.search) params.set('search', filter.search);
    if (filter.staleOnly) params.set('staleOnly', 'true');
    return params;
};
