import { Button } from '@blueprintjs/core';
import { subject } from '@casl/ability';
import { ApiScheduledDownloadCsv, ResultRow } from '@lightdash/common';
import { FC, memo } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { pollCsvFileUrl } from '../../hooks/useDownloadCsv';
import { useApp } from '../../providers/AppProvider';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<string>;
};

const DownloadCsvButton: FC<Props> = memo(({ disabled, getCsvLink }) => {
    const { showToastError } = useToaster();

    return (
        <Button
            intent="primary"
            icon="export"
            disabled={disabled}
            onClick={() => {
                getCsvLink()
                    .then((url) => {
                        window.location.href = url;
                    })
                    .catch((error) => {
                        showToastError({
                            title: `Unable to schedule download CSV`,
                            subtitle: error?.error?.message,
                        });
                    });
            }}
        >
            Export CSV
        </Button>
    );
});

export default DownloadCsvButton;
