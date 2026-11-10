import { type ApiError, type DbtSourceBindings } from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const bindingsUrl = (projectUuid: string) =>
    `/projects/${projectUuid}/warehouse-connections/dbt-sources`;

const bindingsQueryKey = (projectUuid: string) => [
    'projects',
    projectUuid,
    'dbt-source-bindings',
];

export const useDbtSourceBindings = (projectUuid: string, enabled: boolean) => {
    const lightdashApi = useLightdashApi();
    return useQuery<DbtSourceBindings, ApiError>({
        queryKey: bindingsQueryKey(projectUuid),
        queryFn: () =>
            lightdashApi<DbtSourceBindings>({
                url: `${bindingsUrl(projectUuid)}/bindings`,
                method: 'GET',
                body: undefined,
            }),
        enabled,
        retry: false,
    });
};

export const useBindDbtSource = (projectUuid: string) => {
    const lightdashApi = useLightdashApi();
    const queryClient = useQueryClient();
    return useMutation<
        undefined,
        ApiError,
        {
            projectDbtSourceUuid: string;
            warehouseConnectionUuid: string | null;
        }
    >(
        ({ projectDbtSourceUuid, warehouseConnectionUuid }) =>
            lightdashApi<undefined>({
                url: `${bindingsUrl(projectUuid)}/${projectDbtSourceUuid}`,
                method: 'PUT',
                body: JSON.stringify({ warehouseConnectionUuid }),
            }),
        {
            mutationKey: ['bind_dbt_source', projectUuid],
            onSuccess: async () => {
                await queryClient.invalidateQueries(
                    bindingsQueryKey(projectUuid),
                );
            },
        },
    );
};
