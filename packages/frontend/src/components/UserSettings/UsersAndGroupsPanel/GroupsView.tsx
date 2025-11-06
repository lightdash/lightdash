import { type GroupWithMembers } from '@lightdash/common';
import { Stack } from '@mantine-8/core';
import { useState, type FC } from 'react';
import CreateGroupModal from './CreateGroupModal';
import GroupsTable from './GroupsTable';

const GroupsView: FC = () => {
    const [showCreateAndEditModal, setShowCreateAndEditModal] = useState(false);
    const [groupToEdit, setGroupToEdit] = useState<
        GroupWithMembers | undefined
    >(undefined);

    return (
        <Stack gap="xs">
            <GroupsTable
                onAddClick={() => setShowCreateAndEditModal(true)}
                onEditGroup={(group) => {
                    setGroupToEdit(group);
                    setShowCreateAndEditModal(true);
                }}
            />
            {showCreateAndEditModal && (
                <CreateGroupModal
                    key={`create-group-modal-${showCreateAndEditModal}`}
                    opened={showCreateAndEditModal}
                    onClose={() => {
                        setShowCreateAndEditModal(false);
                        setGroupToEdit(undefined);
                    }}
                    groupToEdit={groupToEdit}
                    isEditing={groupToEdit !== undefined}
                />
            )}
        </Stack>
    );
};

export default GroupsView;
