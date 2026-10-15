import {
    SchedulerJobStatus,
    type ApiDownloadCsv,
    type ApiError,
    type ApiScheduledDownloadCsv,
    type GsheetExportProgress,
} from '@lightdash/common';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { getCsvFileUrl } from '../../../api/csv';
import useToaster from '../../../hooks/toaster/useToaster';

const getProgressSubtitle = (
    t: TFunction,
    progress: GsheetExportProgress | null,
): string => {
    if (!progress) return t('googleSheets.progress.mayTakeMinutes');
    if (progress.phase === 'query')
        return t('googleSheets.progress.runningQuery');
    return progress.attempt > 1
        ? t('googleSheets.progress.writingRetry', { attempt: progress.attempt })
        : t('googleSheets.progress.writing');
};

const useExportToGoogleSheetStart = ({
    getGsheetLink,
}: {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
}) => {
    const { t } = useTranslation('export');
    const { showToastApiError, showToastInfo } = useToaster();

    return useMutation<ApiScheduledDownloadCsv | undefined, ApiError>(
        ['google-sheets-start'],
        getGsheetLink,
        {
            onMutate: () => {
                showToastInfo({
                    title: t('googleSheets.toast.exporting'),
                    subtitle: t('googleSheets.progress.mayTakeMinutes'),
                    loading: true,
                    key: 'exporting-gsheets',
                    autoClose: false,
                });
            },
            onError: ({ error }) => {
                notifications.hide('exporting-gsheets');
                showToastApiError({
                    title: t('googleSheets.toast.uploadFailed'),
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
    const { t } = useTranslation('export');
    const { showToastApiError, showToastInfo } = useToaster();

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
        queryKey: [`google-sheets`, startGoogleSheetExportData?.jobId],
        queryFn: () =>
            startGoogleSheetExportData
                ? getCsvFileUrl(startGoogleSheetExportData)
                : Promise.reject({
                      error: new Error(
                          t('googleSheets.errors.schedulerJobFailed'),
                      ),
                  }),
        retry: (failureCount, { error }) => {
            if (failureCount === 5) {
                resetStartGoogleSheetExport();
                showToastApiError({
                    title: t('googleSheets.toast.exportFailed'),
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
                window.open(data.url, '_blank', 'noopener,noreferrer');
                notifications.hide('exporting-gsheets');
                return;
            }
            showToastInfo({
                title: t('googleSheets.toast.exporting'),
                subtitle: getProgressSubtitle(t, data?.progress ?? null),
                loading: true,
                key: 'exporting-gsheets',
                autoClose: false,
            });
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
