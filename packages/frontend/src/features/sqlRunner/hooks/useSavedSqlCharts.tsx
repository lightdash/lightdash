import {
    type ApiCreateSqlChart,
    type ApiError,
    type ApiUpdateSqlChart,
    type CreateSqlChart,
    type PromotionChanges,
    type SqlChart,
    type UpdateSqlChart,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import useApp from '../../../providers/App/useApp';

export type GetSavedSqlChartParams = {
    projectUuid: string;
    slug?: string;
    uuid?: string;
    onSuccess?: (data: SqlChart) => void;
};

export const fetchSavedSqlChart = async ({
    projectUuid,
    slug,
    uuid,
}: GetSavedSqlChartParams) =>
    lightdashApi<SqlChart>({
        url: uuid
            ? `/projects/${projectUuid}/sqlRunner/saved/${uuid}`
            : `/projects/${projectUuid}/sqlRunner/saved/slug/${slug}`,
        method: 'GET',
        body: undefined,
    });

const createSavedSqlChart = async (projectUuid: string, data: CreateSqlChart) =>
    lightdashApi<ApiCreateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const updateSavedSqlChart = async (
    projectUuid: string,
    savedSqlUuid: string,
    data: UpdateSqlChart,
) =>
    lightdashApi<ApiUpdateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useSavedSqlChart = (
    { projectUuid, slug, uuid }: GetSavedSqlChartParams,
    useQueryParams?: UseQueryOptions<SqlChart, ApiError & { slug?: string }>,
) => {
    return useQuery<SqlChart, ApiError>({
        queryKey: ['sqlRunner', 'savedSqlChart', projectUuid, slug, uuid],
        queryFn: () => fetchSavedSqlChart({ projectUuid, slug, uuid }),
        retry: false,
        enabled: !!slug || !!uuid,
        ...useQueryParams,
    });
};

export const useCreateSqlChartMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const navigate = useNavigate();

    return useMutation<ApiCreateSqlChart['results'], ApiError, CreateSqlChart>(
        (data) => createSavedSqlChart(projectUuid, data),
        {
            mutationKey: ['sqlRunner', 'createSqlChart', projectUuid],
            onSuccess: (data) => {
                void navigate(
                    `/projects/${projectUuid}/sql-runner/${data.slug}`,
                );

                showToastSuccess({
                    title: `Success! SQL chart created`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to create chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const useUpdateSqlChartMutation = (
    projectUuid: string | undefined,
    savedSqlUuid: string,
    slug: string,
) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        { savedSqlUuid: string },
        ApiError,
        UpdateSqlChart & { savedSqlUuid?: string }
    >(
        (data) =>
            projectUuid
                ? updateSavedSqlChart(
                      projectUuid,
                      data.savedSqlUuid || savedSqlUuid!,
                      data,
                  )
                : Promise.reject(),
        {
            mutationKey: ['sqlRunner', 'updateSqlChart', savedSqlUuid],
            onSuccess: async () => {
                await queryClient.resetQueries(['savedSqlChart', slug]);
                await queryClient.resetQueries(['savedSqlChartResults', slug]);
                await queryClient.invalidateQueries(['spaces']);
                await queryClient.invalidateQueries(['space']);
                await queryClient.invalidateQueries(['pinned_items']);
                await queryClient.invalidateQueries([
                    'most-popular-and-recently-updated',
                ]);
                await queryClient.invalidateQueries(['content']);
                showToastSuccess({
                    title: `Success! SQL chart updated`,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to update chart`,
                    apiError: error,
                });
            },
        },
    );
};

const deleteSavedSqlChart = async (projectUuid: string, savedSqlUuid: string) =>
    lightdashApi<ApiUpdateSqlChart['results']>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}`,
        method: 'DELETE',
        body: undefined,
    });

const promoteSavedSqlChart = async (
    projectUuid: string,
    savedSqlUuid: string,
) =>
    lightdashApi<SqlChart>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}/promote`,
        method: 'POST',
        body: undefined,
    });

const getPromoteSavedSqlChartDiff = async (
    projectUuid: string,
    savedSqlUuid: string,
) =>
    lightdashApi<PromotionChanges>({
        url: `/projects/${projectUuid}/sqlRunner/saved/${savedSqlUuid}/promoteDiff`,
        method: 'GET',
        body: undefined,
    });

export const useDeleteSqlChartMutation = (
    projectUuid: string,
    savedSqlUuid: string,
) => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { health } = useApp();
    const isSoftDeleteEnabled = health.data?.softDelete.enabled ?? false;
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<{ savedSqlUuid: string }, ApiError>(
        () => deleteSavedSqlChart(projectUuid, savedSqlUuid),
        {
            mutationKey: ['sqlRunner', 'deleteSqlChart', savedSqlUuid],
            onSuccess: async () => {
                await invalidateContent(queryClient, projectUuid);
                await queryClient.invalidateQueries(['sqlRunner']);
                await queryClient.invalidateQueries(['deletedContent']);

                showToastSuccess({
                    title: `Success! SQL chart deleted`,
                    action: isSoftDeleteEnabled
                        ? {
                              children: 'Go to recently deleted',
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/generalSettings/projectManagement/${projectUuid}/recentlyDeleted`,
                                  ),
                          }
                        : undefined,
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to delete chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const usePromoteSqlChartMutation = (projectUuid: string) => {
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<SqlChart, ApiError, string>(
        (savedSqlUuid) => promoteSavedSqlChart(projectUuid, savedSqlUuid),
        {
            mutationKey: ['sqlRunner', 'promoteSqlChart', projectUuid],
            onSuccess: (data) => {
                showToastSuccess({
                    title: `Success! SQL chart promoted.`,
                    action: {
                        children: 'Open chart',
                        icon: IconArrowRight,
                        onClick: () => {
                            window.open(
                                `/projects/${data.project.projectUuid}/sql-runner/${data.slug}`,
                                '_blank',
                            );
                        },
                    },
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to promote SQL chart`,
                    apiError: error,
                });
            },
        },
    );
};

export const usePromoteSqlChartDiffMutation = (projectUuid: string) => {
    const { showToastApiError } = useToaster();

    return useMutation<PromotionChanges, ApiError, string>(
        (savedSqlUuid) =>
            getPromoteSavedSqlChartDiff(projectUuid, savedSqlUuid),
        {
            mutationKey: ['sqlRunner', 'promoteSqlChartDiff', projectUuid],
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to get diff from SQL chart`,
                    apiError: error,
                });
            },
        },
    );
};
