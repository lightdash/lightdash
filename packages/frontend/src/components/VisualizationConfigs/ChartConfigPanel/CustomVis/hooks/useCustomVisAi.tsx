import { type ApiError, type ItemsMap } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { type LightdashApi } from '../../../../../api';
import useToaster from '../../../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../../../providers/LightdashApi/useLightdashApi';

const getCustomVis = async (
    lightdashApi: LightdashApi,
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
    const lightdashApi = useLightdashApi();
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
                lightdashApi,
                projectUuid!,
                data.prompt,
                data.itemsMap,
                data.sampleResults,
                data.currentVizConfig,
            ),
        {
            mutationKey: ['get_custom_vis_ai', projectUuid],
            onError: ({ error }) => {
                showToastApiError({
                    title: `Failed to generate custom visualization`,
                    apiError: error,
                });
            },
        },
    );
};
