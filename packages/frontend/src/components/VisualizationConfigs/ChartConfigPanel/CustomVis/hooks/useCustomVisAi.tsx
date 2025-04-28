import { type ApiError, type ItemsMap } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../../../api';
import useToaster from '../../../../../hooks/toaster/useToaster';

const getCustomVis = async (
    projectUuid: string,
    prompt: string,
    itemsMap: ItemsMap | undefined,
    sampleResults: {
        [k: string]: unknown;
    }[],
    currentVizConfig: string,
) =>
    lightdashApi<string>({
        url: `/ai/${projectUuid}/custom-viz`,
        method: 'POST',
        body: JSON.stringify({
            prompt,
            itemsMap,
            sampleResults,
            currentVizConfig,
        }),
    });

export const useCustomVis = (projectUuid: string | undefined) => {
    const { showToastApiError } = useToaster();
    return useMutation<
        string,
        ApiError,
        {
            prompt: string;
            itemsMap: ItemsMap | undefined;
            sampleResults: {
                [k: string]: unknown;
            }[];
            currentVizConfig: string;
        }
    >(
        (data) =>
            getCustomVis(
                projectUuid!,
                data.prompt,
                data.itemsMap,
                data.sampleResults,
                data.currentVizConfig,
            ),
        {
            mutationKey: ['custom_dimension_write_back', projectUuid],
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to write back custom dimension`,
                    apiError: error,
                });
            },
        },
    );
};
