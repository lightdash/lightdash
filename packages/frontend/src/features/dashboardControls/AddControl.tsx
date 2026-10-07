import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useControlsSidebar } from './useControlsSidebar';

export const AddControl: FC = () => {
    const { isSidebarOpen, openNew } = useControlsSidebar();
    return (
        <Button
            size="xs"
            variant="light"
            aria-label="Add filter or parameter"
            leftSection={<MantineIcon icon={IconPlus} />}
            disabled={isSidebarOpen}
            onClick={openNew}
        >
            Add
        </Button>
    );
};
