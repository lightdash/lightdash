import { Button } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../common/CollapsableCard';
import MantineIcon from '../common/MantineIcon';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<string>;
};

const DownloadCsvButton: FC<Props> = memo(({ disabled, getCsvLink }) => {
    const { showToastError } = useToaster();

    return (
        <Button
            data-testid="export-csv-button"
            {...COLLAPSABLE_CARD_BUTTON_PROPS}
            disabled={disabled}
            px="xs"
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
            <MantineIcon icon={IconShare2} color="gray" />
        </Button>
    );
});

export default DownloadCsvButton;
