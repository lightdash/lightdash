import { GroupWithMembers } from '@lightdash/common';
import { Button, Group, Modal, Text, Title } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type RevokeProjectGroupAccessModalProps = {
    group: GroupWithMembers;
    onDelete: () => void;
    onClose: () => void;
};

const RevokeProjectGroupAccessModal: FC<RevokeProjectGroupAccessModalProps> = ({
    group,
    onDelete,
    onClose,
}) => {
    return (
        <Modal
            opened
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconKey} color="red" />
                    <Title order={4}>Revoke group project access</Title>
                </Group>
            }
        >
            <Text pb="md">
                Are you sure you want to revoke project access for this group "
                {group.name}"?
            </Text>

            <Group spacing="xs" position="right">
                <Button variant="outline" onClick={onClose} color="dark">
                    Cancel
                </Button>

                <Button color="red" onClick={onDelete}>
                    Revoke
                </Button>
            </Group>
        </Modal>
    );
};

export default RevokeProjectGroupAccessModal;
