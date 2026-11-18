import { type ApiScheduledDownloadCsv } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconClipboardCopy, IconFileTypeCsv } from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { ExportToGoogleSheet } from '../../features/export';
import useHealth from '../../hooks/health/useHealth';
import MantineIcon from '../common/MantineIcon';

const ExportSelector: FC<{
    getGsheetLink?: () => Promise<ApiScheduledDownloadCsv>;
    /** Opens the download options, which outlive this menu */
    onDownloadData: () => void;
    /** Copies the results to the clipboard as CSV, once they have loaded */
    copyToClipboard?: { onCopy: () => Promise<void>; isLoading: boolean };
}> = memo(({ getGsheetLink, onDownloadData, copyToClipboard }) => {
    const [isCopying, setIsCopying] = useState(false);
    const health = useHealth();
    const hasGoogleDrive =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    // Reads as a menu: full-width rows, no borders. The options open in
    // a modal owned by the caller.
    return (
        <Stack gap={2} miw={180}>
            <Button
                size="xs"
                variant="subtle"
                fullWidth
                justify="flex-start"
                onClick={onDownloadData}
                leftSection={<MantineIcon icon={IconFileTypeCsv} />}
                data-testid="chart-export-csv-button"
                // Walkthrough hop (manage:ExportCsv): the way to the
                // export form.
                data-tour-anchor="export-choose-download"
                data-tour-hint="Click Download data"
            >
                Download data
            </Button>
            {copyToClipboard && (
                <Button
                    size="xs"
                    variant="subtle"
                    fullWidth
                    justify="flex-start"
                    loading={isCopying || copyToClipboard.isLoading}
                    onClick={() => {
                        setIsCopying(true);
                        void copyToClipboard
                            .onCopy()
                            .finally(() => setIsCopying(false));
                    }}
                    leftSection={<MantineIcon icon={IconClipboardCopy} />}
                    data-testid="chart-export-copy-csv-button"
                >
                    Copy as CSV
                </Button>
            )}
            {hasGoogleDrive && getGsheetLink && (
                <ExportToGoogleSheet getGsheetLink={getGsheetLink} />
            )}
        </Stack>
    );
});

export default ExportSelector;
