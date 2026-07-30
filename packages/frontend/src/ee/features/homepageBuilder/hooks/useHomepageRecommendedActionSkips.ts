import {
    HOMEPAGE_RECOMMENDED_ACTION_SCOPES,
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type ApiError,
    type ApiHomepageRecommendedActionSkipsResponse,
    type HomepageRecommendedActionKey,
    type SkippableHomepageRecommendedActionKey,
    type SkipHomepageRecommendedActionRequest,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type QueryKey,
} from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const HOMEPAGE_RECOMMENDED_ACTION_SKIPS_QUERY_KEY = [
    'homepage-recommended-action-skips',
] as const;

const homepageRecommendedActionSkipsQueryKey = (projectUuid: string | null) => [
    ...HOMEPAGE_RECOMMENDED_ACTION_SKIPS_QUERY_KEY,
    projectUuid,
];

const scopeQuery = (projectUuid: string | null) =>
    projectUuid ? `?${new URLSearchParams({ projectUuid }).toString()}` : '';

const listSkips = (projectUuid: string | null) =>
    lightdashApi<ApiHomepageRecommendedActionSkipsResponse['results']>({
        url: `/ee/homepage/recommended-action-skips${scopeQuery(projectUuid)}`,
        method: 'GET',
        body: undefined,
    });

const skipAction = (
    projectUuid: string | null,
    actionKey: HomepageRecommendedActionKey,
) =>
    lightdashApi<undefined>({
        url: `/ee/homepage/recommended-action-skips${scopeQuery(projectUuid)}`,
        method: 'POST',
        body: JSON.stringify({
            actionKey,
        } satisfies SkipHomepageRecommendedActionRequest),
    });

const unskipAction = (
    projectUuid: string | null,
    actionKey: HomepageRecommendedActionKey,
) =>
    lightdashApi<undefined>({
        url: `/ee/homepage/recommended-action-skips/${encodeURIComponent(
            actionKey,
        )}${scopeQuery(projectUuid)}`,
        method: 'DELETE',
        body: undefined,
    });

type MutationVariables = {
    actionKey: HomepageRecommendedActionKey;
    skipped: boolean;
};

type MutationContext = {
    previousQueries: [
        QueryKey,
        SkippableHomepageRecommendedActionKey[] | undefined,
    ][];
};

export const useHomepageRecommendedActionSkips = (
    projectUuid: string | null,
    { enabled }: { enabled: boolean },
) => {
    const queryClient = useQueryClient();
    const { showToastApiError } = useToaster();
    const queryKey = homepageRecommendedActionSkipsQueryKey(projectUuid);
    const query = useQuery<
        ApiHomepageRecommendedActionSkipsResponse['results'],
        ApiError
    >({
        queryKey,
        queryFn: () => listSkips(projectUuid),
        enabled,
    });
    const mutation = useMutation<
        undefined,
        ApiError,
        MutationVariables,
        MutationContext
    >({
        mutationFn: ({ actionKey, skipped }) =>
            skipped
                ? skipAction(projectUuid, actionKey)
                : unskipAction(projectUuid, actionKey),
        onMutate: async ({ actionKey, skipped }) => {
            const queryFilter =
                HOMEPAGE_RECOMMENDED_ACTION_SCOPES[actionKey] === 'organization'
                    ? {
                          queryKey: HOMEPAGE_RECOMMENDED_ACTION_SKIPS_QUERY_KEY,
                          exact: false,
                      }
                    : { queryKey, exact: true };
            await queryClient.cancelQueries(queryFilter);
            const previousQueries =
                queryClient.getQueriesData<
                    ApiHomepageRecommendedActionSkipsResponse['results']
                >(queryFilter);
            const skippableActionKey =
                SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS.find(
                    (key) => key === actionKey,
                );
            queryClient.setQueriesData<
                ApiHomepageRecommendedActionSkipsResponse['results']
            >(queryFilter, (current) =>
                current === undefined
                    ? current
                    : skipped && skippableActionKey
                      ? current.includes(skippableActionKey)
                          ? current
                          : [...current, skippableActionKey]
                      : current.filter((key) => key !== actionKey),
            );
            return { previousQueries };
        },
        onError: ({ error }, _variables, context) => {
            context?.previousQueries.forEach(([previousQueryKey, previous]) => {
                if (previous === undefined) {
                    queryClient.removeQueries({
                        queryKey: previousQueryKey,
                        exact: true,
                    });
                } else {
                    queryClient.setQueryData(previousQueryKey, previous);
                }
            });
            showToastApiError({
                title: 'Failed to update setup checklist',
                apiError: error,
            });
        },
        onSettled: () =>
            queryClient.invalidateQueries({
                queryKey: HOMEPAGE_RECOMMENDED_ACTION_SKIPS_QUERY_KEY,
                exact: false,
            }),
    });
    const skippedActions: HomepageRecommendedActionKey[] | undefined =
        query.data;

    return {
        skippedActions,
        isLoading: query.isInitialLoading,
        skipAction: (actionKey: HomepageRecommendedActionKey) =>
            mutation.mutate({ actionKey, skipped: true }),
        restoreAction: (actionKey: HomepageRecommendedActionKey) =>
            mutation.mutate({ actionKey, skipped: false }),
    };
};
