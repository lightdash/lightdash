import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import MantineIcon from '../../../components/common/MantineIcon';
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
        // TODO: run validation query
        onClose();
    };
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} size="lg" color="gray.7" />
                    <Text fw={500}>Delete virtual view</Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
            })}
        >
            <Stack pt="sm">
                <Text>
                    Are you sure you want to delete this virtual view? This
                    action cannot be undone and charts based on this virtual
                    view will break.
                </Text>

                <Group position="right" mt="sm">
                    <Button color="dark" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>

                    <Button loading={isLoading} color="red" onClick={onDelete}>
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
