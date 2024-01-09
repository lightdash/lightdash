import { GroupMember, ProjectMemberRole } from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Group,
    Modal,
    ModalProps,
    Select,
    Stack,
    Table,
    Title,
    Tooltip,
} from '@mantine/core';
import { useListState } from '@mantine/hooks';
import { IconUsersGroup } from '@tabler/icons-react';
import { FC, useEffect } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { TrackPage } from '../../../providers/TrackingProvider';
import { CategoryName, PageName, PageType } from '../../../types/Events';

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

type ProjectGroupAccessState = {
    projectUuid: string;
    groupUuid: string;
    groupName: string;
    groupUserMembers: GroupMember[];
    enabled: boolean;
    role: ProjectMemberRole;
};

const ProjectGroupAccessModal: FC<ProjectGroupAccessModalProps> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const { data: groups, isLoading } = useOrganizationGroups(5);
    const [
        projectGroupAccess,
        {
            setState: setProjectGroupAccessState,
            setItemProp: setProjectGroupAccessItemProp,
        },
    ] = useListState<ProjectGroupAccessState>();

    useEffect(() => {
        if (groups === undefined) return;

        setProjectGroupAccessState(
            groups.map((group) => ({
                projectUuid,
                groupUuid: group.uuid,
                groupName: group.name,
                groupUserMembers: group.members,
                enabled: false,
                role: ProjectMemberRole.VIEWER,
            })),
        );
    }, [groups, projectUuid, setProjectGroupAccessState]);

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
                        <Table>
                            <tbody>
                                {projectGroupAccess.map(
                                    (groupAccess, index) => (
                                        <Box
                                            component="tr"
                                            key={groupAccess.groupUuid}
                                            bg={
                                                groupAccess.enabled
                                                    ? 'blue.0'
                                                    : 'transparent'
                                            }
                                        >
                                            <td>
                                                <Checkbox
                                                    label={
                                                        groupAccess.groupName
                                                    }
                                                    checked={
                                                        groupAccess.enabled
                                                    }
                                                    description={
                                                        <>
                                                            <Tooltip
                                                                withinPortal
                                                                position="right"
                                                                disabled={
                                                                    groupAccess
                                                                        .groupUserMembers
                                                                        .length ===
                                                                    0
                                                                }
                                                                label={
                                                                    <Stack spacing="one">
                                                                        {/* TODO: truncate the list of members if it's too long once we'll have total number of users from the API */}
                                                                        {groupAccess.groupUserMembers.map(
                                                                            (
                                                                                member,
                                                                            ) => (
                                                                                <span
                                                                                    key={
                                                                                        member.userUuid
                                                                                    }
                                                                                >
                                                                                    {[
                                                                                        member.firstName,
                                                                                        member.lastName,
                                                                                    ].join(
                                                                                        ' ',
                                                                                    ) ||
                                                                                        member.email}
                                                                                </span>
                                                                            ),
                                                                        )}
                                                                    </Stack>
                                                                }
                                                            >
                                                                {/* TODO: members are limited, we should expose total number of users from the API (which we don't ATM)  */}
                                                                <span>
                                                                    {
                                                                        groupAccess
                                                                            .groupUserMembers
                                                                            .length
                                                                    }{' '}
                                                                    members
                                                                </span>
                                                            </Tooltip>
                                                        </>
                                                    }
                                                    onClick={(event) => {
                                                        setProjectGroupAccessItemProp(
                                                            index,
                                                            'enabled',
                                                            event.currentTarget
                                                                .checked,
                                                        );
                                                    }}
                                                />
                                            </td>

                                            <td style={{ width: '40%' }}>
                                                <Select
                                                    withinPortal
                                                    disabled={
                                                        !groupAccess.enabled
                                                    }
                                                    data={groupRoles}
                                                    value={groupAccess.role}
                                                    onChange={(
                                                        value: ProjectMemberRole | null,
                                                    ) => {
                                                        if (
                                                            typeof value !==
                                                            'string'
                                                        )
                                                            return;

                                                        setProjectGroupAccessItemProp(
                                                            index,
                                                            'role',
                                                            value,
                                                        );
                                                    }}
                                                />
                                            </td>
                                        </Box>
                                    ),
                                )}
                            </tbody>
                        </Table>

                        <Button style={{ alignSelf: 'flex-end' }}>Save</Button>
                    </Stack>
                )}
            </TrackPage>
        </Modal>
    );
};

export default ProjectGroupAccessModal;
