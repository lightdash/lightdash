import { Button } from '@blueprintjs/core';
import { ResultRow } from '@lightdash/common';
import { FC, memo } from 'react';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<string>;
};

const DownloadCsvButton: FC<Props> = memo(({ disabled, getCsvLink }) => {
    return (
        <Button
            intent="primary"
            icon="export"
            disabled={disabled}
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
