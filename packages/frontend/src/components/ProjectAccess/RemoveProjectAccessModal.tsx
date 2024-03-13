import { type OrganizationMemberProfile } from '@lightdash/common';
import { Button, Group, Modal, Text, Title } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';

type Props = {
    user: OrganizationMemberProfile;
    onDelete: () => void;
    onClose: () => void;
};

const RemoveProjectAccessModal: FC<Props> = ({ user, onDelete, onClose }) => {
    return (
        <Modal
            opened
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconKey} color="red" />
                    <Title order={4}>Revoke project access</Title>
                </Group>
            }
        >
            <Text pb="md">
                Are you sure you want to revoke project access for this user{' '}
                {user.email} ?
            </Text>
            <Group spacing="xs" position="right">
                <Button variant="outline" onClick={onClose} color="dark">
                    Cancel
                </Button>
                <Button color="red" onClick={onDelete}>
                    Delete
                </Button>
            </Group>
        </Modal>
    );
};

export default RemoveProjectAccessModal;
