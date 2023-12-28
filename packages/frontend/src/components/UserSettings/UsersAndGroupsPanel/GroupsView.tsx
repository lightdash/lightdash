import { Button, Stack, Table } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useApp } from '../../../providers/AppProvider';
import LoadingState from '../../common/LoadingState';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import CreateGroupModal from './CreateGroupModal';

const GroupsView: FC = () => {
    const { classes } = useTableStyles();
    const { user } = useApp();

    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

    const { data: groups, isLoading: isLoadingGroups } =
        useOrganizationGroups();

    if (isLoadingGroups) {
        <LoadingState title="Loading groups" />;
    }

    return (
        <Stack spacing="xs" mt="xs">
            {user.data?.ability?.can('manage', 'Group') && (
                <Button
                    compact
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setShowCreateGroupModal(true)}
                    sx={{ alignSelf: 'end' }}
                >
                    Add group
                </Button>
            )}
            <SettingsCard shadow="none" p={0}>
                <Table className={classes.root}>
                    <thead>
                        <tr>
                            <th>Group</th>
                        </tr>
                    </thead>
                    <tbody>
                        {groups?.map((group) => (
                            <tr key={group.name}>
                                <td>{group.name}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </SettingsCard>
            <CreateGroupModal
                key={`create-group-modal-${showCreateGroupModal}`}
                opened={showCreateGroupModal}
                onClose={() => setShowCreateGroupModal(false)}
            />
        </Stack>
    );
};

export default GroupsView;
