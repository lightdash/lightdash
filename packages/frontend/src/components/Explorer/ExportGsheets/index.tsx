import { ApiScheduledDownloadCsv } from '@lightdash/common';
import { FC, memo } from 'react';
import { useMutation } from 'react-query';

import { Spinner } from '@blueprintjs/core';
import { Button } from '@mantine/core';
import useToaster from '../../../hooks/toaster/useToaster';
import { pollCsvFileUrl } from '../../../hooks/useDownloadCsv';
import { AppToaster } from '../../AppToaster';

export type ExportCSVProps = {
    getGsheetLink: () => Promise<ApiScheduledDownloadCsv>;
};

const ExportGsheets: FC<ExportCSVProps> = memo(({ getGsheetLink }) => {
    const { showToastError, showToast } = useToaster();

    const { mutateAsync: exportCsvMutation } = useMutation(
        [],
        () => getGsheetLink(),
        {
            onMutate: () => {
                showToast({
                    title: 'Exporting CSV',
                    subtitle: 'This may take a few minutes...',
                    icon: (
                        <Spinner
                            className="bp4-icon bp4-icon-error"
                            size={16}
                        />
                    ),
                    key: 'exporting-csv',
                    timeout: 0,
                });
            },
            onSuccess: (scheduledCsvResponse) => {
                pollCsvFileUrl(scheduledCsvResponse)
                    .then((url) => {
                        if (url) window.location.href = url;
                        AppToaster.dismiss('exporting-csv');
                    })
                    .catch((error) => {
                        AppToaster.dismiss('exporting-csv');

                        showToastError({
                            title: `Unable to download CSV`,
                            subtitle: error?.error?.message,
                        });
                    });
            },
            onError: (error: { error: Error }) => {
                AppToaster.dismiss('exporting-csv');

                showToastError({
                    title: `Unable to download CSV`,
                    subtitle: error?.error?.message,
                });
            },
        },
    );

    return (
        <Button variant="subtle" onClick={() => exportCsvMutation()}>
            Google sheets{' '}
        </Button>
    );
});

export default ExportGsheets;
