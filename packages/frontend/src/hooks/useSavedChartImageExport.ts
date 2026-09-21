import {
    type ApiExportChartImageResponse,
    type ApiError,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import { downloadImageUrl } from '../components/common/ChartDownload/chartDownloadUtils';
import useToaster from './toaster/useToaster';

type ExportSavedChartImageArgs = {
    chartUuid: string;
    projectUuid: string;
    chartName?: string;
};

/** Request the backend-generated image URL for a saved chart. */
const exportSavedChartImage = async ({
    chartUuid,
    projectUuid,
}: ExportSavedChartImageArgs): Promise<string> =>
    lightdashApi<ApiExportChartImageResponse['results']>({
        url: `/saved/${chartUuid}/export?projectUuid=${encodeURIComponent(
            projectUuid,
        )}`,
        method: 'POST',
        body: undefined,
    });

/** Export a saved chart image, download it, and report failures to the user. */
export const useSavedChartImageExport = () => {
    const { showToastError } = useToaster();

    return useMutation<string, ApiError, ExportSavedChartImageArgs>({
        mutationFn: async (args) => {
            const imageUrl = await exportSavedChartImage(args);
            await downloadImageUrl(imageUrl, args.chartName);
            return imageUrl;
        },
        onError: () => {
            showToastError({ title: 'Unable to download chart image' });
        },
    });
};
