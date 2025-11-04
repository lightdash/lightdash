import { Stack } from '@mantine-8/core';
import { useState, type FC } from 'react';
import InvitesModal from './InvitesModal';
import UsersTable from './UsersTable';

const UsersView: FC = () => {
    const [showInviteModal, setShowInviteModal] = useState(false);

    return (
        <Stack gap="xs">
            <UsersTable onInviteClick={() => setShowInviteModal(true)} />
            <InvitesModal
                key={`invite-modal-${showInviteModal}`}
                opened={showInviteModal}
                onClose={() => setShowInviteModal(false)}
            />
        </Stack>
    );
};

export default UsersView;
