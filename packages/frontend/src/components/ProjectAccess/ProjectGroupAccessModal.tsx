import { ProjectMemberRole } from '@lightdash/common';
import {
    Button,
    Checkbox,
    Group,
    Modal,
    ModalProps,
    Select,
    Stack,
    Title,
} from '@mantine/core';
import { IconUsersGroup } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import { useOrganizationGroups } from '../../hooks/useOrganizationGroups';
import { TrackPage } from '../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

interface ProjectGroupAccessModalProps extends ModalProps {
    projectUuid: string;
}

const groupRoles = [
    {
        value: ProjectMemberRole.VIEWER,
        label: 'Viewer',
    },
    {
        value: ProjectMemberRole.INTERACTIVE_VIEWER,
        label: 'Interactive viewer',
    },
    {
        value: ProjectMemberRole.DEVELOPER,
        label: 'Developer',
    },
    {
        value: ProjectMemberRole.EDITOR,
        label: 'Editor',
    },
    {
        value: ProjectMemberRole.ADMIN,
        label: 'Admin',
    },
] as const;

const ProjectGroupAccessModal: FC<ProjectGroupAccessModalProps> = ({
    opened,
    onClose,
    // projectUuid,
}) => {
    const { data: groups, isLoading } = useOrganizationGroups();
    const [enabledGroups, setEnabledGroup] = useState<string[]>([]);

    const handleToggleGroup = useCallback(
        (uuid: string) => {
            if (enabledGroups.includes(uuid)) {
                setEnabledGroup(enabledGroups.filter((u) => u !== uuid));
            } else {
                setEnabledGroup([...enabledGroups, uuid]);
            }
        },
        [enabledGroups],
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUsersGroup} />
                    <Title order={4}>Manage group access</Title>
                </Group>
            }
            size="lg"
        >
            <TrackPage
                name={PageName.PROJECT_MANAGE_GROUP_ACCESS}
                type={PageType.MODAL}
                category={CategoryName.SETTINGS}
            >
                {isLoading || groups === undefined ? (
                    <SuboptimalState loading />
                ) : groups.length === 0 ? (
                    <SuboptimalState title="No groups found..." />
                ) : (
                    <Stack>
                        {groups.map((group) => (
                            <Group key={group.uuid} position="apart">
                                <Checkbox
                                    label={group.name}
                                    checked={enabledGroups.includes(group.uuid)}
                                    onClick={() =>
                                        handleToggleGroup(group.uuid)
                                    }
                                />

                                <Select
                                    withinPortal
                                    disabled={
                                        !enabledGroups.includes(group.uuid)
                                    }
                                    data={groupRoles}
                                    defaultValue={ProjectMemberRole.VIEWER}
                                />
                            </Group>
                        ))}

                        <Button style={{ alignSelf: 'flex-end' }}>Save</Button>
                    </Stack>
                )}
            </TrackPage>
        </Modal>
    );
};

export default ProjectGroupAccessModal;
