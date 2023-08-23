import { Button } from '@blueprintjs/core';
import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { FC, memo } from 'react';
import { pollCsvFileUrl } from '../../api/csv';
import useToaster from '../../hooks/toaster/useToaster';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<ApiScheduledDownloadCsv>;
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
                    .then((scheduledCsvResponse) => {
                        pollCsvFileUrl(scheduledCsvResponse)
                            .then((url) => {
                                window.location.href = url;
                            })
                            .catch((error) => {
                                showToastError({
                                    title: `Unable to download CSV`,
                                    subtitle: error?.error?.message,
                                });
                            });
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
