import { type UserWarehouseCredentials } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useUserWarehouseCredentialsDeleteMutation } from '../../../hooks/userWarehouseCredentials/useUserWarehouseCredentials';
import MantineIcon from '../../common/MantineIcon';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    warehouseCredentialsToBeDeleted: UserWarehouseCredentials;
};

export const DeleteCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    warehouseCredentialsToBeDeleted,
}) => {
    const { mutateAsync, isLoading: isDeleting } =
        useUserWarehouseCredentialsDeleteMutation(
            warehouseCredentialsToBeDeleted.uuid,
        );
    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>Delete credentials</Title>
                </Group>
            }
            opened={opened}
            onClose={onClose}
        >
            <Stack>
                <Text fz="sm">
                    Are you sure you want to delete credentials:{' '}
                    <b>{warehouseCredentialsToBeDeleted.name}</b>?
                </Text>

                <Group position="right" spacing="xs">
                    <Button
                        size="xs"
                        variant="outline"
                        onClick={onClose}
                        color="dark"
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>

                    <Button
                        size="xs"
                        color="red"
                        onClick={async () => {
                            await mutateAsync();
                            onClose();
                        }}
                        type="submit"
                        disabled={isDeleting}
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
