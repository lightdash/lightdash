import {
    type ManagedAgentAction,
    type ManagedAgentActionType,
    type ManagedAgentTargetType,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { lightdashApi } from '../../../../api';

export type ManagedAgentActionQueryFilters = {
    search?: string;
    actionTypes?: ManagedAgentActionType[];
    targetTypes?: ManagedAgentTargetType[];
    dateFrom?: string;
    dateTo?: string;
};

const getActions = async (
    projectUuid: string,
    runUuid?: string,
    filters?: ManagedAgentActionQueryFilters,
): Promise<ManagedAgentAction[]> => {
    const params = new URLSearchParams();
    if (runUuid) params.set('runUuid', runUuid);
    if (filters?.search) params.set('search', filters.search);
    filters?.actionTypes?.forEach((type) => params.append('actionTypes', type));
    filters?.targetTypes?.forEach((type) => params.append('targetTypes', type));
    if (filters?.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters?.dateTo) params.set('dateTo', filters.dateTo);
    const qs = params.toString();
    return lightdashApi<ManagedAgentAction[]>({
        url: `/projects/${projectUuid}/managed-agent/actions${qs ? `?${qs}` : ''}`,
        method: 'GET',
        body: undefined,
    });
};

export const useManagedAgentActions = (
    opts: {
        enabled?: boolean;
        fastPoll?: boolean;
        runUuid?: string;
        filters?: ManagedAgentActionQueryFilters;
    } = {},
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const isEnabled = opts.enabled ?? true;
    return useQuery<ManagedAgentAction[]>({
        queryKey: [
            'managed-agent-actions',
            projectUuid,
            ...(opts.runUuid ? [opts.runUuid] : []),
            ...(opts.filters ? [opts.filters] : []),
        ],
        queryFn: () => getActions(projectUuid!, opts.runUuid, opts.filters),
        enabled: !!projectUuid && isEnabled,
        keepPreviousData: !!opts.filters,
        refetchInterval: isEnabled ? (opts.fastPoll ? 3000 : 30000) : false,
    });
};
