import {
    type ApiError,
    type ApiScheduledDownloadCsv,
    type GsheetExportProgress,
} from '@lightdash/common';
import { IconExternalLink } from '@tabler/icons-react';
import { useIsMutating, useMutation } from '@tanstack/react-query';
import { getCsvFileUrl } from '../../../api/csv';
import useToaster from '../../../hooks/toaster/useToaster';
import { useLightdashApi } from '../../../providers/LightdashApi/useLightdashApi';

const TOAST_KEY = 'exporting-gsheets';
const MUTATION_KEY = ['google-sheets-export'];
const POLL_INTERVAL_MS = 2000;
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

const wait = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

const openSheet = (url: string) =>
    window.open(url, '_blank', 'noopener,noreferrer');

const isApiError = (error: unknown): error is ApiError =>
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof error.error === 'object' &&
    error.error !== null;

const getProgressSubtitle = (progress: GsheetExportProgress | null): string => {
    if (!progress) return 'This may take a few minutes...';
    if (progress.phase === 'query') return 'Running query...';
    return progress.attempt > 1
        ? `Writing to Google Sheets... (retry ${progress.attempt})`
        : 'Writing to Google Sheets...';
};

export const useExportToGoogleSheet = ({
    getGsheetLink,
}: {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
}) => {
    const lightdashApi = useLightdashApi();
    const {
        showToastApiError,
        showToastError,
        showToastInfo,
        showToastSuccess,
    } = useToaster();

    // The whole export runs inside the mutation: unlike a polling query, it
    // keeps going after the menu or popover that started it unmounts.
    const { mutate } = useMutation<string, unknown>({
        mutationKey: MUTATION_KEY,
        mutationFn: async () => {
            const showProgress = (progress: GsheetExportProgress | null) =>
                showToastInfo({
                    title: 'Exporting Google Sheets',
                    subtitle: getProgressSubtitle(progress),
                    loading: true,
                    key: TOAST_KEY,
                    autoClose: false,
                });

            try {
                showProgress(null);
                const job = await getGsheetLink();

                let consecutiveFailures = 0;
                for (;;) {
                    try {
                        const status = await getCsvFileUrl(lightdashApi, job);
                        consecutiveFailures = 0;
                        if (status.url) {
                            const { url } = status;
                            // Browsers may block this, the toast keeps the link
                            openSheet(url);
                            showToastSuccess({
                                title: 'Exported to Google Sheets',
                                key: TOAST_KEY,
                                autoClose: false,
                                action: {
                                    children: 'Open sheet',
                                    icon: IconExternalLink,
                                    onClick: () => openSheet(url),
                                },
                            });
                            return url;
                        }
                        showProgress(status.progress ?? null);
                    } catch (error) {
                        consecutiveFailures += 1;
                        if (
                            consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES
                        ) {
                            throw error;
                        }
                    }
                    await wait(POLL_INTERVAL_MS);
                }
            } catch (error) {
                const title = 'Unable to export to Google Sheets';
                if (isApiError(error)) {
                    showToastApiError({
                        title,
                        key: TOAST_KEY,
                        apiError: error.error,
                    });
                } else {
                    showToastError({ title, key: TOAST_KEY });
                }
                throw error;
            }
        },
    });

    // Read from the mutation cache so a remounted button still shows progress
    const isExporting = useIsMutating({ mutationKey: MUTATION_KEY }) > 0;

    return {
        startExporting: mutate,
        isExporting,
    };
};
