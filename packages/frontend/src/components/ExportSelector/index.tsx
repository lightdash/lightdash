import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { FC, memo, useState } from 'react';
import ExportGsheets from '../Explorer/ExportGsheets';
import ExportCSV, { ExportCSVProps } from '../ExportCSV';

const ExportSelector: FC<
    ExportCSVProps & { getGsheetLink: () => Promise<ApiScheduledDownloadCsv> }
> = memo(({ rows, getCsvLink, getGsheetLink }) => {
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
    }

    return (
        <Stack>
            <Button variant="subtle" onClick={() => setExportType('csv')}>
                Csv{' '}
            </Button>
            <ExportGsheets rows={rows} getGsheetLink={getGsheetLink} />
        </Stack>
    );
});

export default ExportSelector;
