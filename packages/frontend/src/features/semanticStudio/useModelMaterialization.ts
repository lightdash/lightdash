import {
    FeatureFlags,
    type ApiError,
    type ModelMaterializationList,
    type ModelMaterializationSample,
    type ModelMaterializationStatus,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useMemo, useState } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { DRAFT_KEY, useSemanticLayerStatus } from './useSemanticLayerModel';

const key = 'studio-materializations';

export const ModelMaterializationContext = createContext({
    enabled: false,
    models: new Set<string>(),
});

export const useModelMaterializationOverview = (projectUuid: string) => {
    const api = useLightdashApi();
    const flag = useServerFeatureFlag(FeatureFlags.SemanticStudioEditing);
    const status = useSemanticLayerStatus(projectUuid);
    const enabled =
        flag.data?.enabled === true &&
        status?.enabled === true &&
        status.appliesAs !== 'dbt_pull_request';
    const { data } = useQuery<ModelMaterializationList, ApiError>({
        queryKey: [key, projectUuid, 'list'],
        enabled,
        queryFn: () =>
            api({
                url: `/projects/${projectUuid}/semantic-studio/materializations`,
                method: 'GET',
                body: undefined,
            }),
        refetchInterval: 30_000,
    });
    return useMemo(
        () => ({ enabled, models: new Set(enabled ? data?.models : []) }),
        [enabled, data],
    );
};

export const useModelMaterialization = (projectUuid: string, model: string) => {
    const api = useLightdashApi();
    const client = useQueryClient();
    const url = `/projects/${projectUuid}/semantic-studio/models/${encodeURIComponent(model)}/materialization`;
    const queryKey = [key, projectUuid, 'model', model];
    const [requested, setRequested] = useState<{
        url: string;
        asOf: string | null;
        until: number;
    } | null>(null);
    const queued = requested !== null && requested.url === url;

    const status = useQuery<ModelMaterializationStatus, ApiError>({
        queryKey,
        queryFn: () => api({ url, method: 'GET', body: undefined }),
        onSuccess: (data) => {
            if (
                queued &&
                (data.state === 'preparing' ||
                    data.asOf !== requested.asOf ||
                    Date.now() >= requested.until)
            )
                setRequested(null);
            const listKey = [key, projectUuid, 'list'];
            const list = client.getQueryData<ModelMaterializationList>(listKey);
            if (list && list.models.includes(model) !== data.servingCopy)
                void client.invalidateQueries({ queryKey: listKey });
        },
        refetchInterval: (data) =>
            queued || data?.state === 'preparing' ? 2_000 : 30_000,
    });
    const sample = useQuery<ModelMaterializationSample, ApiError>({
        queryKey: [...queryKey, 'sample', status.data?.asOf],
        queryFn: () =>
            api({ url: `${url}/sample`, method: 'GET', body: undefined }),
        enabled: status.data?.servingCopy === true,
        staleTime: Infinity,
    });
    const change = useMutation<void, ApiError, 'draft' | 'refresh'>({
        mutationFn: async (action) => {
            await api({
                url: `${url}/${action}`,
                method: 'POST',
                body: undefined,
            });
        },
        onSuccess: async (_, action) => {
            if (action === 'refresh')
                setRequested({
                    url,
                    asOf: status.data?.asOf ?? null,
                    until: Date.now() + 30_000,
                });
            await Promise.all([
                client.invalidateQueries({ queryKey, exact: true }),
                ...(action === 'draft'
                    ? [
                          client.invalidateQueries({
                              queryKey: [DRAFT_KEY, projectUuid],
                          }),
                      ]
                    : []),
            ]);
        },
    });
    return { status, sample, change, queued };
};
