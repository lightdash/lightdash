import { type OrganizationWarehouseCredentials } from '@lightdash/common';
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
import { useDeleteOrganizationWarehouseCredentials } from '../../../hooks/organization/useOrganizationWarehouseCredentials';
import MantineIcon from '../../common/MantineIcon';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    warehouseCredentialsToBeDeleted: OrganizationWarehouseCredentials;
};

export const DeleteCredentialsModal: FC<Props> = ({
    opened,
    onClose,
    warehouseCredentialsToBeDeleted,
}) => {
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationWarehouseCredentials();
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
                            await mutateAsync(
                                warehouseCredentialsToBeDeleted.organizationWarehouseCredentialsUuid,
                            );
                            onClose();
                        }}
                        type="submit"
                        loading={isDeleting}
                        disabled={isDeleting}
                    >
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
