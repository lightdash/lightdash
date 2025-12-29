import { Button } from '@mantine-8/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import { type ProjectUserWithRole } from '../../hooks/useProjectUsersWithRoles';
import MantineModal from '../common/MantineModal';

type Props = {
    user: Pick<ProjectUserWithRole, 'firstName' | 'lastName' | 'email'>;
    onDelete: () => void;
    onClose: () => void;
};

const RemoveProjectAccessModal: FC<Props> = ({ user, onDelete, onClose }) => {
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Revoke project access"
            icon={IconKey}
            description={`Are you sure you want to revoke project access for "${
                user.firstName && user.lastName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email
            }"?`}
            actions={
                <Button color="red" onClick={onDelete}>
                    Delete
                </Button>
            }
        />
    );
};

export default RemoveProjectAccessModal;
