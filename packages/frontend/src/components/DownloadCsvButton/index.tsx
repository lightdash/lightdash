import { Button } from '@blueprintjs/core';
import { ResultRow } from '@lightdash/common';
import { FC, memo } from 'react';

type Props = {
    rows: ResultRow[] | undefined;
    getCsvLink: () => Promise<string>;
};

const DownloadCsvButton: FC<Props> = memo(({ rows, getCsvLink }) => {
    return (
        <Button
            intent="primary"
            icon="export"
            disabled={!rows || rows.length <= 0}
            onClick={() =>
                getCsvLink().then((url) => {
                    window.open(url, '_blank');
                })
            }
        >
            Export CSV
        </Button>
    );
});

export default DownloadCsvButton;
