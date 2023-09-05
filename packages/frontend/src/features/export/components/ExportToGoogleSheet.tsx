import { Spinner } from '@blueprintjs/core';
import { MenuItem2 } from '@blueprintjs/popover2';
import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { Button } from '@mantine/core';
import { FC, memo, useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { GsheetsIcon } from '../../../components/SchedulerModals/SchedulerModalBase/SchedulerModalBase.styles';
import { useGdriveAccessToken } from '../../../hooks/gdrive/useGdrive';
import useHealth from '../../../hooks/health/useHealth';
import { useExportToGoogleSheet } from '../hooks/useExportToGoogleSheet';

export type ExportToGoogleSheetProps = {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
    asMenuItem?: boolean;
    disabled?: boolean;
};

export const ExportToGoogleSheet: FC<ExportToGoogleSheetProps> = memo(
    ({ getGsheetLink, asMenuItem, disabled }) => {
        const health = useHealth();

        const hasGoogleDrive =
            health.data?.auth.google.oauth2ClientId !== undefined &&
            health.data?.auth.google.googleDriveApiKey !== undefined;

        const [isGoogleAuthQueryEnabled, setIsGoogleAuthQueryEnabled] =
            useState(false);

        const { startExporting, isExporting } = useExportToGoogleSheet({
            getGsheetLink,
        });

        useGdriveAccessToken({
            enabled: isGoogleAuthQueryEnabled,
            onSuccess: () => {
                startExporting();
                setIsGoogleAuthQueryEnabled(false);
            },
        });

        if (!hasGoogleDrive) {
            // We should not load this component on `ExporSelector` if google keys are not available
            console.warn('Using ExportGsheets without Google Drive API keys');
            return null;
        }

        if (asMenuItem) {
            return (
                <MenuItem2
                    icon={isExporting ? <Spinner size={16} /> : 'export'}
                    text="Export Google Sheets"
                    disabled={isExporting || disabled}
                    shouldDismissPopover={false}
                    onClick={() => setIsGoogleAuthQueryEnabled(true)}
                />
            );
        }
        return (
            <Button
                size="xs"
                variant="default"
                loading={isExporting}
                leftIcon={<MantineIcon icon={GsheetsIcon} />}
                onClick={() => setIsGoogleAuthQueryEnabled(true)}
                disabled={disabled}
            >
                Google Sheets
            </Button>
        );
    },
);
