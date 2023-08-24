import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { FC, memo, useCallback } from 'react';
import { useMutation } from 'react-query';

import { Spinner } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { Button } from '@mantine/core';
import { pollCsvFileUrl } from '../../../api/csv';
import { useGdriveAccessToken } from '../../../hooks/gdrive/useGdrive';
import useHealth from '../../../hooks/health/useHealth';
import useToaster from '../../../hooks/toaster/useToaster';
import { AppToaster } from '../../AppToaster';

export type ExportGsheetProps = {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
    asMenuItem?: boolean;
    context: 'dashboard' | 'chart' | 'results';
};

const ExportGsheets: FC<ExportGsheetProps> = memo(
    ({ getGsheetLink, asMenuItem, context }) => {
        const { data: gdriveAuth, refetch } = useGdriveAccessToken();
        const health = useHealth();
        const hasGoogleDrive =
            health.data?.auth.google.oauth2ClientId !== undefined &&
            health.data?.auth.google.googleDriveApiKey !== undefined;

        const { showToastError, showToast } = useToaster();

        // TODO: move to own hook
        const {
            mutateAsync: exportGoogleSheet,
            isLoading: isExportGoogleSheetLoading,
        } = useMutation(
            [`google-sheets-${context}`],
            (params: ApiScheduledDownloadCsv) =>
                params
                    ? pollCsvFileUrl(params)
                    : Promise.reject({
                          error: new Error(
                              "Couldn't create scheduler job for google sheets export",
                          ),
                      }),
            {
                onSuccess: (url) => {
                    if (url) window.open(url, '_blank');
                },
                onSettled: () => {
                    AppToaster.dismiss('exporting-gsheets');
                },
                onError: (error: { error: Error }) => {
                    showToastError({
                        title: `Unable to upload to Google Sheets`,
                        subtitle: error?.error?.message,
                    });
                },
            },
        );

        // TODO: move to own hook
        const {
            mutateAsync: startGoogleSheetExport,
            isLoading: isStartGoogleSheetExportLoading,
        } = useMutation(['google-sheets-start'], getGsheetLink, {
            onMutate: () => {
                showToast({
                    title: 'Exporting Google Sheets',
                    subtitle: 'This may take a few minutes...',
                    icon: (
                        <Spinner
                            className="bp4-icon bp4-icon-error"
                            size={16}
                        />
                    ),
                    key: 'exporting-gsheets',
                    timeout: 0,
                });
            },
            onSuccess: (dataJobId) => {
                exportGoogleSheet(dataJobId);
            },
            onError: (error: { error: Error }) => {
                showToastError({
                    title: `Unable to upload to Google Sheets`,
                    subtitle: error?.error?.message,
                });
            },
        });

        const handleLoginAndExport = useCallback(() => {
            if (
                !health.data?.auth.google.oauth2ClientId ||
                !health.data.auth.google.googleDriveApiKey
            )
                return;

            if (gdriveAuth === undefined) {
                const gdriveUrl = `${health?.data?.siteUrl}/api/v1/login/gdrive`;
                window.open(gdriveUrl, 'login-popup', 'width=600,height=600');

                // Refetching until user logs in with google drive auth
                const refetchAuth = setInterval(() => {
                    refetch().then((r) => {
                        if (r.data !== undefined) {
                            clearInterval(refetchAuth);
                            startGoogleSheetExport();
                        }
                    });
                }, 2000);
                return false;
            }

            startGoogleSheetExport();
        }, [
            gdriveAuth,
            health.data?.auth.google.googleDriveApiKey,
            health.data?.auth.google.oauth2ClientId,
            health.data?.siteUrl,
            refetch,
            startGoogleSheetExport,
        ]);

        if (!hasGoogleDrive) {
            // We should not load this component on `ExporSelector` if google keys are not available
            console.warn('Using ExportGsheets without Google Drive API keys');
            return null;
        }

        if (asMenuItem) {
            return (
                <MenuItem2
                    icon="export"
                    text="Export Google Sheets"
                    onClick={handleLoginAndExport}
                />
            );
        }
        return (
            <Button
                size="xs"
                variant="default"
                loading={
                    isStartGoogleSheetExportLoading ||
                    isExportGoogleSheetLoading
                }
                onClick={handleLoginAndExport}
            >
                Google Sheets
            </Button>
        );
    },
);

export default ExportGsheets;
