import { Button } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { useRefreshSchedulers } from './useRefreshSchedulers';

export const RefreshSchedulersButton: FC = () => {
    const handleRefresh = useRefreshSchedulers();

    return (
        <Button
            size="xs"
            variant="default"
            leftSection={<MantineIcon icon={IconRefresh} />}
            onClick={handleRefresh}
        >
            Refresh
        </Button>
    );
};
