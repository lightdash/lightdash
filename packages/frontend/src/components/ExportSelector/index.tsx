import {
    SchedulerJobStatus,
    type ApiDownloadCsv,
    type ApiError,
    type ApiScheduledDownloadCsv,
} from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconArrowLeft, IconFileTypeCsv } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { memo, useState, type FC } from 'react';
import { ExportToGoogleSheet } from '../../features/export';
import useHealth from '../../hooks/health/useHealth';
import ExportCSV, { type ExportCSVProps } from '../ExportCSV';
import MantineIcon from '../common/MantineIcon';

const ExportSelector: FC<
    ExportCSVProps & {
        getGsheetLink?: () => Promise<ApiScheduledDownloadCsv>;
    }
> = memo(({ projectUuid, totalResults, getCsvLink, getGsheetLink }) => {
    const health = useHealth();
    const hasGoogleDrive =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    const [exportType, setExportType] = useState<string | undefined>();

    const { data } = useQuery<ApiDownloadCsv | undefined, ApiError>({
        queryKey: [`google-sheets`],
        enabled: false,
    });

    const isExportingGoogleSheets = data?.status === SchedulerJobStatus.STARTED;

    if (exportType === 'csv') {
        return (
            <>
                <Button
                    color="gray.6"
                    size="xs"
                    mb="xs"
                    leftIcon={<IconArrowLeft size="16" />}
                    variant="subtle"
                    onClick={() => setExportType(undefined)}
                >
                    Back to export selector
                </Button>
                <ExportCSV
                    totalResults={totalResults}
                    getCsvLink={getCsvLink}
                    projectUuid={projectUuid}
                />
            </>
        );
    } else if (hasGoogleDrive && getGsheetLink) {
        return (
            <Stack spacing="xs">
                <Button
                    size="xs"
                    variant="default"
                    onClick={() => setExportType('csv')}
                    leftIcon={<MantineIcon icon={IconFileTypeCsv} />}
                    disabled={isExportingGoogleSheets}
                    data-testid="chart-export-csv-button"
                >
                    csv
                </Button>
                <ExportToGoogleSheet getGsheetLink={getGsheetLink} />
            </Stack>
        );
    }

    return (
        <ExportCSV
            totalResults={totalResults}
            getCsvLink={getCsvLink}
            projectUuid={projectUuid}
        />
    );
});

export default ExportSelector;
