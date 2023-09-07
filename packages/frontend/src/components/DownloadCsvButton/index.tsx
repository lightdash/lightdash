import { Button } from '@blueprintjs/core';
import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { FC, memo } from 'react';
import { pollCsvFileUrl } from '../../api/csv';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<ApiScheduledDownloadCsv>;
};

const DownloadCsvButton: FC<Props> = memo(({ disabled, getCsvLink }) => {
    const { showToastError } = useToaster();
    const health = useHealth();

    return (
        <Button
            intent="primary"
            icon="export"
            disabled={disabled}
            onClick={() => {
                getCsvLink()
                    .then((scheduledCsvResponse) => {
                        pollCsvFileUrl(scheduledCsvResponse)
                            .then((csvFile) => {
                                window.location.href = csvFile.url;

                                if (csvFile.truncated) {
                                    showToastError({
                                        title: `Your results might be truncated`,
                                        subtitle: `Results are limited to ${health.data?.query.csvCellsLimit} cells for each file`,
                                    });
                                }
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
