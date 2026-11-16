import {
    SchedulerJobStatus,
    type ApiDownloadCsv,
    type ApiError,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconFileTypeCsv } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { memo, type FC } from 'react';
import { ExportToGoogleSheet } from '../../features/export';
import useHealth from '../../hooks/health/useHealth';
import MantineIcon from '../common/MantineIcon';

const ExportSelector: FC<{
    getGsheetLink?: () => Promise<ApiScheduledDownloadCsv>;
    /** Opens the download options, which outlive this menu */
    onDownloadData: () => void;
}> = memo(({ getGsheetLink, onDownloadData }) => {
    const health = useHealth();
    const hasGoogleDrive =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    const { data } = useQuery<ApiDownloadCsv | undefined, ApiError>({
        queryKey: [`google-sheets`],
        enabled: false,
    });

    const isExportingGoogleSheets = data?.status === SchedulerJobStatus.STARTED;

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
                disabled={isExportingGoogleSheets}
                data-testid="chart-export-csv-button"
                // Walkthrough hop (manage:ExportCsv): the way to the
                // export form.
                data-tour-anchor="export-choose-download"
                data-tour-hint="Click Download data"
            >
                Download data
            </Button>
            {hasGoogleDrive && getGsheetLink && (
                <ExportToGoogleSheet getGsheetLink={getGsheetLink} />
            )}
        </Stack>
    );
});

export default ExportSelector;
