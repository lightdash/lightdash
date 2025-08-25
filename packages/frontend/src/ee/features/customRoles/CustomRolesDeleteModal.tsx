import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { type FC } from 'react';

import { type RoleWithScopes } from '@lightdash/common';

type DeleteModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onDelete: () => void;
    isDeleting?: boolean;
    role: RoleWithScopes;
};

export const CustomRolesDeleteModal: FC<DeleteModalProps> = ({
    isOpen,
    onClose,
    onDelete,
    isDeleting = false,
    role,
}) => {
    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            title="Delete custom role"
            size="md"
        >
            <Stack>
                <Text>
                    Are you sure you want to delete the role{' '}
                    <Text component="span" weight="bold">
                        {role.name}
                    </Text>
                    ?
                </Text>
                <Text size="sm" color="dimmed">
                    This action cannot be undone. Users and groups will no
                    longer be able to use this role.
                </Text>
                <Group position="right" mt="md">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isDeleting}
                    >
                        Cancel
                    </Button>
                    <Button color="red" onClick={onDelete} loading={isDeleting}>
                        Delete role
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
