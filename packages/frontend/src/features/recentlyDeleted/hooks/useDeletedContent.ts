import {
    ContentType,
    type ApiError,
    type DataAppVizsFilter,
    type DeletedContentItem,
    type DeletedContentWithDescendants,
    type KnexPaginatedData,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import {
    getDeletedContent,
    permanentlyDeleteContent,
    restoreDeletedContent,
} from '../api/deletedContent';

const DEFAULT_PAGE_SIZE = 50;

type UseInfiniteDeletedContentParams = {
    projectUuids: string[];
    pageSize?: number;
    search?: string;
    contentTypes?: ContentType[];
    deletedByUserUuids?: string[];
    dataAppVizsFilter?: DataAppVizsFilter;
};

export function useInfiniteDeletedContent(
    params: UseInfiniteDeletedContentParams,
) {
    return useInfiniteQuery<
        KnexPaginatedData<DeletedContentWithDescendants[]>,
        ApiError
    >({
        queryKey: [
            'deletedContent',
            params.projectUuids,
            params.pageSize,
            params.search,
            params.contentTypes,
            params.deletedByUserUuids,
            params.dataAppVizsFilter,
        ],
        queryFn: async ({ pageParam = 1 }) => {
            return getDeletedContent({
                projectUuids: params.projectUuids,
                page: pageParam as number,
                pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE,
                search: params.search,
                contentTypes: params.contentTypes,
                deletedByUserUuids: params.deletedByUserUuids,
                dataAppVizsFilter: params.dataAppVizsFilter,
            });
        },
        getNextPageParam: (_lastGroup, groups) => {
            const currentPage = groups.length;
            const totalPages = _lastGroup.pagination?.totalPageCount ?? 0;
            return currentPage < totalPages ? currentPage + 1 : undefined;
        },
        keepPreviousData: true,
        refetchOnWindowFocus: false,
    });
}

/**
 * `isChartType` is presentation-only (custom chart types restore to the
 * builder route, not the app viewer) — it is stripped before the API call.
 */
export type RestoreDeletedContentItem = DeletedContentItem & {
    isChartType?: boolean;
};

export function useRestoreDeletedContent(projectUuid: string) {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation('settings');

    return useMutation<undefined, ApiError, RestoreDeletedContentItem>({
        mutationFn: ({ isChartType, ...item }) =>
            restoreDeletedContent(projectUuid, item),
        onSuccess: async (_data, item) => {
            showToastSuccess({
                title: t('recentlyDeleted.toast.restored'),
                subtitle: t('recentlyDeleted.toast.restoredSubtitle'),
                action:
                    item.contentType === ContentType.CHART
                        ? {
                              children: t('recentlyDeleted.toast.goToChart'),
                              icon: IconArrowRight,
                              onClick: () =>
                                  navigate(
                                      `/projects/${projectUuid}/saved/${item.uuid}`,
                                  ),
                          }
                        : item.contentType === ContentType.DASHBOARD
                          ? {
                                children: t(
                                    'recentlyDeleted.toast.goToDashboard',
                                ),
                                icon: IconArrowRight,
                                onClick: () =>
                                    navigate(
                                        `/projects/${projectUuid}/dashboards/${item.uuid}`,
                                    ),
                            }
                          : item.contentType === ContentType.SPACE
                            ? {
                                  children: t(
                                      'recentlyDeleted.toast.goToSpace',
                                  ),
                                  icon: IconArrowRight,
                                  onClick: () =>
                                      navigate(
                                          `/projects/${projectUuid}/spaces/${item.uuid}`,
                                      ),
                              }
                            : item.contentType === ContentType.DATA_APP
                              ? {
                                    children: item.isChartType
                                        ? t(
                                              'recentlyDeleted.toast.goToChartType',
                                          )
                                        : t('recentlyDeleted.toast.goToApp'),
                                    icon: IconArrowRight,
                                    onClick: () =>
                                        navigate(
                                            item.isChartType
                                                ? `/projects/${projectUuid}/chart-studio/${item.uuid}`
                                                : `/projects/${projectUuid}/apps/${item.uuid}`,
                                        ),
                                }
                              : item.contentType === ContentType.DOCUMENT
                                ? {
                                      children: t(
                                          'recentlyDeleted.toast.goToDocument',
                                      ),
                                      icon: IconArrowRight,
                                      onClick: () =>
                                          navigate(
                                              `/projects/${projectUuid}/documents/${item.uuid}`,
                                          ),
                                  }
                                : undefined,
            });
            await invalidateContent(queryClient, projectUuid);
            await queryClient.invalidateQueries(['deletedContent']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('recentlyDeleted.toast.restoreFailed'),
                apiError: error,
            });
        },
    });
}

export function usePermanentlyDeleteContent(projectUuid: string) {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const { t } = useTranslation('settings');

    return useMutation<undefined, ApiError, DeletedContentItem>({
        mutationFn: (item) => permanentlyDeleteContent(projectUuid, item),
        onSuccess: async () => {
            showToastSuccess({
                title: t('recentlyDeleted.toast.deleted'),
                subtitle: t('recentlyDeleted.toast.deletedSubtitle'),
            });
            await invalidateContent(queryClient, projectUuid);
            await queryClient.invalidateQueries(['deletedContent']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: t('recentlyDeleted.toast.deleteFailed'),
                apiError: error,
            });
        },
    });
}
