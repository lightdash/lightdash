import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { Button, Loader, Menu } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { FC, memo, useState } from 'react';
import { GSheetsIcon } from '../../../components/common/GSheetsIcon';
import MantineIcon from '../../../components/common/MantineIcon';
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
                <Menu.Item
                    icon={
                        isExporting ? (
                            <Loader />
                        ) : (
                            <MantineIcon icon={IconShare2} />
                        )
                    }
                    disabled={isExporting || disabled}
                    onClick={() => setIsGoogleAuthQueryEnabled(true)}
                    closeMenuOnClick={false}
                >
                    Export Google Sheets
                </Menu.Item>
            );
        }

        return (
            <Button
                size="xs"
                variant="default"
                loading={isExporting}
                leftIcon={<MantineIcon icon={GSheetsIcon} />}
                onClick={() => setIsGoogleAuthQueryEnabled(true)}
                disabled={disabled}
            >
                Google Sheets
            </Button>
        );
    },
);
