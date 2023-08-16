import { Button, Stack } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { FC, memo, useState } from 'react';
import ExportCSV, { ExportCSVProps } from '../ExportCSV';

const ExportSelector: FC<ExportCSVProps> = memo(({ rows, getCsvLink }) => {
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
            <Button variant="subtle" onClick={() => setExportType('gsheets')}>
                Google sheets{' '}
            </Button>
        </Stack>
    );
});

export default ExportSelector;
