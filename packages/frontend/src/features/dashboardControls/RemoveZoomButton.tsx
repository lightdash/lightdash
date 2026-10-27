import { Button } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import { useControlsSidebarSelector } from './useControlsSidebar';

// An existing zoom's way out of the dashboard, as a filter pill's X; a new
// zoom leaves through Cancel
export const RemoveZoomButton: FC = () => {
    const isNew = useControlsSidebarSelector((c) => c.isNew);
    const removeZoom = useControlsSidebarSelector((c) => c.removeZoom);
    if (isNew) return null;
    return (
        <Button
            size="xs"
            variant="subtle"
            color="red"
            leftSection={<MantineIcon icon={IconTrash} />}
            onClick={removeZoom}
        >
            Remove date zoom
        </Button>
    );
};
