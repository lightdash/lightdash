import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { Button } from '@mantine/core';
import { IconTableExport } from '@tabler/icons-react';
import { FC, memo } from 'react';
import { pollCsvFileUrl } from '../../api/csv';
import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';
import MantineIcon from '../common/MantineIcon';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<ApiScheduledDownloadCsv>;
};

const DownloadCsvButton: FC<Props> = memo(({ disabled, getCsvLink }) => {
    const { showToastError, showToastWarning } = useToaster();
    const health = useHealth();

    return (
        <Button
            compact
            variant="subtle"
            leftIcon={<MantineIcon icon={IconTableExport} />}
            disabled={disabled}
            onClick={() => {
                getCsvLink()
                    .then((scheduledCsvResponse) => {
                        pollCsvFileUrl(scheduledCsvResponse)
                            .then((csvFile) => {
                                window.location.href = csvFile.url;

                                if (csvFile.truncated) {
                                    showToastWarning({
                                        title: `The results in this export have been limited.`,
                                        subtitle: `The export limit is ${health.data?.query.csvCellsLimit} cells, but your file exceeded that limit.`,
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
