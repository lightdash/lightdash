import { Button } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';

export const NotificationsMenu = () => {
    return (
        <Button variant="default" size="xs" pos="relative">
            <MantineIcon icon={IconBell} />
        </Button>
    );
};
