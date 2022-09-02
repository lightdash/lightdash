import { Button, Icon } from '@blueprintjs/core';
import React, { FC, memo } from 'react';
import { CSVLink } from 'react-csv';

type Props = {
    fileName: string | undefined;
    rows: object[] | undefined;
};

const DownloadCsvButton: FC<Props> = memo(({ fileName, rows }) => {
    if (!rows || rows.length <= 0) {
        return <Button icon="download" text=".csv" disabled />;
    }
    return (
        <CSVLink
            role="button"
            tabIndex={0}
            className="bp4-button"
            data={rows}
            filename={`lightdash-${fileName || 'export'}-${new Date()
                .toISOString()
                .slice(0, 10)}.csv`}
            target="_blank"
        >
            <Icon icon="download" />
            <span>.csv</span>
        </CSVLink>
    );
});

export default DownloadCsvButton;
