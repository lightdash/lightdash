import { Button } from '@blueprintjs/core';
import { FC, memo } from 'react';
import CSVExporter from '../CSVExporter';

type Props = {
    fileName: string | undefined;
    rows: object[] | undefined;
};

const DownloadCsvButton: FC<Props> = memo(({ fileName, rows = [] }) => {
    return (
        <CSVExporter
            data={rows}
            filename={`lightdash-${fileName || 'export'}-${new Date()
                .toISOString()
                .slice(0, 10)}.csv`}
            renderElement={({ handleCsvExport, isDisabled }) => (
                <Button
                    icon="export"
                    disabled={isDisabled}
                    onClick={handleCsvExport}
                >
                    Export CSV
                </Button>
            )}
        />
    );
});

export default DownloadCsvButton;
