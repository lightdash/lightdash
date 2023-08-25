import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { FC, memo, useState } from 'react';
import useHealth from '../../hooks/health/useHealth';
import ExportGsheets from '../Explorer/ExportGsheets';
import ExportCSV, { ExportCSVProps } from '../ExportCSV';

const ExportSelector: FC<
    ExportCSVProps & {
        getGsheetLink?: () => Promise<ApiScheduledDownloadCsv>;
    }
> = memo(({ rows, getCsvLink, getGsheetLink }) => {
    const health = useHealth();
    const hasGoogleDrive =
        health.data?.auth.google.oauth2ClientId !== undefined &&
        health.data?.auth.google.googleDriveApiKey !== undefined;

    const [exportType, setExportType] = useState<string | undefined>();

    if (exportType === 'csv') {
        return (
            <>
                <Button
                    color="gray.6"
                    size="xs"
                    leftIcon={<IconArrowLeft size="16" />}
                    variant="subtle"
                    onClick={() => setExportType(undefined)}
                >
                    Back to export selector
                </Button>
                <ExportCSV rows={rows} getCsvLink={getCsvLink} />
            </>
        );
    } else if (hasGoogleDrive && getGsheetLink) {
        return (
            <Stack spacing="xs">
                <Button
                    size="xs"
                    variant="default"
                    onClick={() => setExportType('csv')}
                >
                    csv
                </Button>
                <ExportGsheets getGsheetLink={getGsheetLink} />
            </Stack>
        );
    }

    return <ExportCSV rows={rows} getCsvLink={getCsvLink} />;
});

export default ExportSelector;
