import {
    type ApiError,
    type LiveSourceContentUsage,
    type LiveSourceExploreChange,
    type LiveSourceFieldChange,
    type LiveSourceFields,
    type LiveSourceRefreshSummary,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

type LiveSourceParams = {
    projectUuid: string;
    connectionUuid: string;
};

const getFieldsUrl = ({ projectUuid, connectionUuid }: LiveSourceParams) =>
    `/ee/projects/${projectUuid}/external-connections/${connectionUuid}/fields`;

const getFieldsQueryKey = ({ projectUuid, connectionUuid }: LiveSourceParams) =>
    ['live-source-fields', projectUuid, connectionUuid] as const;

/** Every field of a live data source, in use or available. */
export const useLiveSourceFields = ({
    enabled = true,
    ...params
}: LiveSourceParams & { enabled?: boolean }) => {
    const lightdashApi = useLightdashApi();
    return useQuery<LiveSourceFields, ApiError>({
        queryKey: getFieldsQueryKey(params),
        enabled,
        queryFn: () =>
            lightdashApi<LiveSourceFields>({
                url: getFieldsUrl(params),
                method: 'GET',
                body: undefined,
            }),
    });
};

const useApplyFields = (params: LiveSourceParams) => {
    const queryClient = useQueryClient();
    return async (fields: LiveSourceFields) => {
        queryClient.setQueryData(getFieldsQueryKey(params), fields);
        // Explores were rebuilt, so the explorer and agents see the new fields
        await queryClient.invalidateQueries({ queryKey: ['tables'] });
    };
};

export const useUpdateLiveSourceFields = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const applyFields = useApplyFields(params);
    const { showToastApiError } = useToaster();
    return useMutation<LiveSourceFields, ApiError, LiveSourceFieldChange[]>({
        mutationFn: (changes) =>
            lightdashApi<LiveSourceFields>({
                url: getFieldsUrl(params),
                method: 'PATCH',
                body: JSON.stringify({ changes }),
            }),
        onSuccess: applyFields,
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update fields',
                apiError: error,
            });
        },
    });
};

/** Switches explores on or off, or changes their label, description or AI hint. */
export const useUpdateLiveSourceExplores = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const applyFields = useApplyFields(params);
    const { showToastApiError } = useToaster();
    return useMutation<LiveSourceFields, ApiError, LiveSourceExploreChange[]>({
        mutationFn: (exploreChanges) =>
            lightdashApi<LiveSourceFields>({
                url: getFieldsUrl(params),
                method: 'PATCH',
                body: JSON.stringify({ changes: [], exploreChanges }),
            }),
        onSuccess: applyFields,
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update explore',
                apiError: error,
            });
        },
    });
};

/** The saved charts on an explore, or on one of its fields, and their dashboards. */
export const useLiveSourceContentUsage = ({
    exploreName,
    fieldName,
    enabled = true,
    ...params
}: LiveSourceParams & {
    exploreName: string;
    fieldName: string | null;
    enabled?: boolean;
}) => {
    const lightdashApi = useLightdashApi();
    const query = new URLSearchParams({
        exploreName,
        ...(fieldName === null ? {} : { fieldName }),
    });
    return useQuery<LiveSourceContentUsage, ApiError>({
        queryKey: [
            'live-source-content-usage',
            params.projectUuid,
            params.connectionUuid,
            exploreName,
            fieldName,
        ],
        enabled,
        queryFn: () =>
            lightdashApi<LiveSourceContentUsage>({
                url: `/ee/projects/${params.projectUuid}/external-connections/${params.connectionUuid}/content-usage?${query.toString()}`,
                method: 'GET',
                body: undefined,
            }),
    });
};

const refreshFields = async (
    lightdashApi: LightdashApi,
    params: LiveSourceParams,
) => {
    const summary = await lightdashApi<LiveSourceRefreshSummary>({
        url: `/ee/projects/${params.projectUuid}/external-connections/${params.connectionUuid}/refresh-explores`,
        method: 'POST',
        body: undefined,
    });
    const fields = await lightdashApi<LiveSourceFields>({
        url: getFieldsUrl(params),
        method: 'GET',
        body: undefined,
    });
    return { summary, fields };
};

const countOf = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? '' : 's'}`;

/** What a Refresh found, in a sentence; null when nothing changed. */
const describeLiveSourceRefresh = (
    summary: LiveSourceRefreshSummary,
): string | null => {
    const fieldCount = (byExplore: Record<string, string[]>) =>
        Object.values(byExplore).reduce((sum, names) => sum + names.length, 0);
    const parts = [
        [summary.addedObjects.length, 'new object'],
        [summary.removedObjects.length, 'removed object'],
        [fieldCount(summary.addedFields), 'new field'],
        [fieldCount(summary.removedFields), 'removed field'],
    ] as const;
    const changes = parts
        .filter(([count]) => count > 0)
        .map(([count, noun]) => countOf(count, noun));
    return changes.length > 0 ? changes.join(', ') : null;
};

/** Reads what the integration offers now: new fields and objects, and ones gone. */
export const useRefreshLiveSourceFields = (params: LiveSourceParams) => {
    const lightdashApi = useLightdashApi();
    const applyFields = useApplyFields(params);
    const { showToastSuccess, showToastApiError } = useToaster();
    return useMutation<
        { summary: LiveSourceRefreshSummary; fields: LiveSourceFields },
        ApiError
    >({
        mutationFn: () => refreshFields(lightdashApi, params),
        onSuccess: async ({ summary, fields }) => {
            await applyFields(fields);
            const changes = describeLiveSourceRefresh(summary);
            showToastSuccess({
                title: 'Fields refreshed',
                subtitle: changes
                    ? `Found ${changes}.${summary.addedObjects.length > 0 ? ' New objects start switched off.' : ''}`
                    : 'Nothing changed since the last refresh.',
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to refresh fields',
                apiError: error,
            });
        },
    });
};
