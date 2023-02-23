import { Button } from '@blueprintjs/core';
import { ResultRow } from '@lightdash/common';
import { FC, memo } from 'react';
import useToaster from '../../hooks/toaster/useToaster';

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
            onClick={() =>
                getCsvLink()
                    .then((url) => {
                        window.open(url, '_blank');
                    })
                    .catch((error) => {
                        console.error(
                            `Unable to download CSV ${JSON.stringify(error)}`,
                        );

                        showToastError({
                            title: `Unable to download CSV`,
                            subtitle: error?.error?.message,
                        });
                    })
            }
        >
            Export CSV
        </Button>
    );
});

export default DownloadCsvButton;
