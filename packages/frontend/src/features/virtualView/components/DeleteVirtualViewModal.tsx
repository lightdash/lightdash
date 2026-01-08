import { Text } from '@mantine-8/core';
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
    const handleConfirm = () => {
        mutate({ projectUuid, name: virtualViewName });
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete virtual view"
            variant="delete"
            resourceType="virtual view"
            resourceLabel={virtualViewName}
            onConfirm={handleConfirm}
            confirmLoading={isLoading}
        >
            <Text fz="sm" c="dimmed">
                This action cannot be undone and charts based on this virtual
                view will break.
            </Text>
        </MantineModal>
    );
};
