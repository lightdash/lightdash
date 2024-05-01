import {
    SchedulerJobStatus,
    type ApiDownloadCsv,
    type ApiError,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getCsvFileUrl } from '../../../api/csv';
import useToaster from '../../../hooks/toaster/useToaster';

const useExportToGoogleSheetStart = ({
    getGsheetLink,
}: {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
}) => {
    const { showToastApiError, showToastInfo } = useToaster();

    return useMutation<ApiScheduledDownloadCsv | undefined, ApiError>(
        ['google-sheets-start'],
        getGsheetLink,
        {
            onMutate: () => {
                showToastInfo({
                    title: 'Exporting Google Sheets',
                    subtitle: 'This may take a few minutes...',
                    loading: true,
                    key: 'exporting-gsheets',
                    autoClose: false,
                });
            },
            onError: ({ error }) => {
                notifications.hide('exporting-gsheets');
                showToastApiError({
                    title: `Unable to upload to Google Sheets`,
                    apiError: error,
                });
            },
        },
    );
};

export const useExportToGoogleSheet = ({
    getGsheetLink,
}: {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
}) => {
    const { showToastApiError } = useToaster();

    const exportToGoogleSheetStartMutation = useExportToGoogleSheetStart({
        getGsheetLink,
    });
    const {
        data: startGoogleSheetExportData,
        reset: resetStartGoogleSheetExport,
    } = exportToGoogleSheetStartMutation;

    const exportToGoogleSheetQuery = useQuery<
        ApiDownloadCsv | undefined,
        ApiError
    >({
        queryKey: [`google-sheets`],
        queryFn: () =>
            startGoogleSheetExportData
                ? getCsvFileUrl(startGoogleSheetExportData)
                : Promise.reject({
                      error: new Error(
                          "Couldn't create scheduler job for google sheets export",
                      ),
                  }),
        retry: (failureCount, { error }) => {
            if (failureCount === 5) {
                resetStartGoogleSheetExport();
                showToastApiError({
                    title: 'Unable to export to Google Sheets',
                    apiError: error,
                });
                return false;
            }
            return true;
        },
        refetchInterval: (data) => {
            if (data?.url) return false;
            return 2000;
        },
        onSuccess: (data) => {
            if (data?.url && data.status === SchedulerJobStatus.COMPLETED) {
                window.open(data.url, '_blank');
                notifications.hide('exporting-gsheets');
            }
        },
        onError: () => {
            notifications.hide('exporting-gsheets');
        },
        refetchOnWindowFocus: false,
        refetchOnMount: false,
        enabled: !!startGoogleSheetExportData,
    });

    return {
        startExporting: exportToGoogleSheetStartMutation.mutate,
        isExporting:
            !!exportToGoogleSheetStartMutation.data &&
            !exportToGoogleSheetQuery.data?.url,
    };
};
