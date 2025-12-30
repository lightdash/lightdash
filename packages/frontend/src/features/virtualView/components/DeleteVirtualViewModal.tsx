import { Button } from '@mantine-8/core';
import { IconTrash } from '@tabler/icons-react';
import MantineModal from '../../../components/common/MantineModal';
import { useDeleteVirtualView } from '../../virtualView/hooks/useVirtualView';

export const DeleteVirtualViewModal = ({
    opened,
    onClose,
    virtualViewName,
    projectUuid,
}: {
    opened: boolean;
    onClose: () => void;
    virtualViewName: string;
    projectUuid: string;
}) => {
    const { mutate, isLoading } = useDeleteVirtualView(projectUuid);
    const onDelete = () => {
        mutate({ projectUuid, name: virtualViewName });
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete virtual view"
            icon={IconTrash}
            description="Are you sure you want to delete this virtual view? This action cannot be undone and charts based on this virtual view will break."
            actions={
                <Button loading={isLoading} color="red" onClick={onDelete}>
                    Delete
                </Button>
            }
        />
    );
};
