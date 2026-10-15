import { type ApiError, type ItemsMap } from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('vizConfig');
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
            mutationKey: ['get_custom_vis_ai', projectUuid],
            onError: ({ error }) => {
                showToastApiError({
                    title: t('customVis.generateFailed'),
                    apiError: error,
                });
            },
        },
    );
};
