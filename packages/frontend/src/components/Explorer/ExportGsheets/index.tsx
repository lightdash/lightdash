import {
    ApiDownloadCsv,
    ApiError,
    ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { FC, memo, useCallback } from 'react';
import { useMutation, useQuery } from 'react-query';

import { Spinner } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { Button } from '@mantine/core';
import { getCsvFileUrl } from '../../../api/csv';
import { useGdriveAccessToken } from '../../../hooks/gdrive/useGdrive';
import useHealth from '../../../hooks/health/useHealth';
import useToaster from '../../../hooks/toaster/useToaster';
import { AppToaster } from '../../AppToaster';

export type ExportGsheetProps = {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
    asMenuItem?: boolean;
};

const ExportGsheets: FC<ExportGsheetProps> = memo(
    ({ getGsheetLink, asMenuItem }) => {
        const { data: gdriveAuth, refetch } = useGdriveAccessToken();
        const health = useHealth();
        const hasGoogleDrive =
            health.data?.auth.google.oauth2ClientId !== undefined &&
            health.data?.auth.google.googleDriveApiKey !== undefined;

        const { showToastError, showToast } = useToaster();

        // TODO: move to own hook

        const {
            mutateAsync: startGoogleSheetExport,
            data: startGoogleSheetExportData,
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

            onError: (error: { error: Error }) => {
                showToastError({
                    title: `Unable to upload to Google Sheets`,
                    subtitle: error?.error?.message,
                });
            },
        });

        const { data: exportGoogleSheetData } = useQuery<
            ApiDownloadCsv | undefined,
            ApiError
        >({
            queryKey: [`google-sheets`],
            queryFn: () => getCsvFileUrl(startGoogleSheetExportData!),
            refetchInterval: (data) => {
                if (data?.url) return false;
                return 2000;
            },

            onSuccess: (data) => {
                if (data?.url) {
                    window.open(data.url, '_blank');
                    AppToaster.dismiss('exporting-gsheets');
                }
            },
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            enabled: !!startGoogleSheetExportData,
        });

        const buttonIsLoading =
            !!startGoogleSheetExportData && !exportGoogleSheetData?.url;

        // TODO: move to own hook

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
                loading={buttonIsLoading}
                onClick={handleLoginAndExport}
            >
                Google Sheets
            </Button>
        );
    },
);

export default ExportGsheets;
