import {
    SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS,
    type ApiError,
    type ApiHomepageRecommendedActionSkipsResponse,
    type HomepageRecommendedActionKey,
    type SkippableHomepageRecommendedActionKey,
    type SkipHomepageRecommendedActionRequest,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';

const homepageRecommendedActionSkipsQueryKey = (projectUuid: string | null) =>
    ['homepage-recommended-action-skips', projectUuid] as const;

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
    previous: SkippableHomepageRecommendedActionKey[] | undefined;
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
            await queryClient.cancelQueries(queryKey);
            const previous =
                queryClient.getQueryData<
                    ApiHomepageRecommendedActionSkipsResponse['results']
                >(queryKey);
            const skippableActionKey =
                SKIPPABLE_HOMEPAGE_RECOMMENDED_ACTION_KEYS.find(
                    (key) => key === actionKey,
                );
            queryClient.setQueryData<
                ApiHomepageRecommendedActionSkipsResponse['results']
            >(queryKey, (current = []) =>
                skipped && skippableActionKey
                    ? current.includes(skippableActionKey)
                        ? current
                        : [...current, skippableActionKey]
                    : current.filter((key) => key !== actionKey),
            );
            return { previous };
        },
        onError: ({ error }, _variables, context) => {
            queryClient.setQueryData(queryKey, context?.previous);
            showToastApiError({
                title: 'Failed to update setup checklist',
                apiError: error,
            });
        },
        onSettled: () => queryClient.invalidateQueries(queryKey),
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
