import { type GroupWithMembers } from '@lightdash/common';
import { Button } from '@mantine-8/core';
import { IconKey } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal, {
    type MantineModalProps,
} from '../../../components/common/MantineModal';

type RevokeProjectGroupAccessModalProps = Pick<MantineModalProps, 'onClose'> & {
    group: GroupWithMembers;
    onDelete: () => void;
};

const RevokeProjectGroupAccessModal: FC<RevokeProjectGroupAccessModalProps> = ({
    group,
    onDelete,
    onClose,
}) => {
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Revoke group project access"
            icon={IconKey}
            description={`Are you sure you want to revoke project access for this group "${group.name}"?`}
            actions={
                <Button color="red" onClick={onDelete}>
                    Revoke
                </Button>
            }
        />
    );
};

export default RevokeProjectGroupAccessModal;
