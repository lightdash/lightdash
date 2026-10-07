import { Button } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useFilterSidebar } from './useFilterSidebar';

export const AddFilter: FC = () => {
    const { isSidebarOpen, openNew } = useFilterSidebar();
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
