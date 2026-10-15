import {
    type ApiError,
    type ApiSetPreAggregateCompileTriggerBody,
    type ApiSetPreAggregateCompileTriggerResponse,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

const setPreAggregateCompileTrigger = async (
    projectUuid: string,
    body: ApiSetPreAggregateCompileTriggerBody,
) =>
    lightdashApi<ApiSetPreAggregateCompileTriggerResponse['results']>({
        version: 'v2',
        url: `/projects/${projectUuid}/pre-aggregates/compile-trigger`,
        method: 'PATCH',
        body: JSON.stringify(body),
    });

const describeChange = (
    body: ApiSetPreAggregateCompileTriggerBody,
    updatedCount: number,
) => {
    const scope =
        body.preAggregateDefinitionNames === undefined
            ? `${updatedCount} pre-aggregate${updatedCount === 1 ? '' : 's'}`
            : body.preAggregateDefinitionNames.join(', ');
    switch (body.materializeOnCompile) {
        case true:
            return `${scope} will rebuild on every project compile`;
        case false:
            return `${scope} will skip project compiles and rebuild on schedule or manually`;
        case null:
            return `${scope} now follow their YAML refresh settings`;
        default:
            return undefined;
    }
};

export const useSetPreAggregateCompileTrigger = (projectUuid: string) => {
    const { showToastApiError, showToastSuccess } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<
        ApiSetPreAggregateCompileTriggerResponse['results'],
        ApiError,
        ApiSetPreAggregateCompileTriggerBody
    >((body) => setPreAggregateCompileTrigger(projectUuid, body), {
        mutationKey: ['setPreAggregateCompileTrigger', projectUuid],
        onSuccess: async (data, body) => {
            await queryClient.invalidateQueries({
                queryKey: ['preAggregateMaterializations', projectUuid],
            });
            showToastSuccess({
                title: 'Compile trigger updated',
                subtitle: describeChange(body, data.updatedCount),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update compile trigger',
                apiError: error,
            });
        },
    });
};
