import { ActionIcon } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import useToaster from '../../hooks/toaster/useToaster';
import { COLLAPSABLE_CARD_ACTION_ICON_PROPS } from '../common/CollapsableCard';
import MantineIcon from '../common/MantineIcon';

type Props = {
    disabled: boolean;
    getCsvLink: () => Promise<string>;
};

const DownloadCsvButton: FC<Props> = memo(({ disabled, getCsvLink }) => {
    const { showToastError } = useToaster();

    return (
        <ActionIcon
            data-testid="export-csv-button"
            {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
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
            <MantineIcon icon={IconShare2} color="gray" />
        </ActionIcon>
    );
});

export default DownloadCsvButton;
