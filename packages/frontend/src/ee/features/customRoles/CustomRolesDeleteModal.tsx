import {
    assertUnreachable,
    type RoleAssignee,
    type RoleAssigneeKind,
    type RoleWithScopes,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Center,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    type MantineColor,
} from '@mantine-8/core';
import {
    IconRobot,
    IconUser,
    IconUsers,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { Fragment, useMemo, type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useRoleAssignees } from './useCustomRoles';

type DeleteModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onDelete: () => void;
    isDeleting?: boolean;
    role: RoleWithScopes;
};

type KindMeta = {
    label: string;
    color: MantineColor;
    icon: TablerIcon;
    order: number;
};

const KIND_META: Record<RoleAssigneeKind, KindMeta> = {
    service_account: {
        label: 'Service account',
        color: 'blue',
        icon: IconRobot,
        order: 0,
    },
    organization_user: {
        label: 'Org member',
        color: 'gray',
        icon: IconUser,
        order: 1,
    },
    project_user: {
        label: 'Project member',
        color: 'gray',
        icon: IconUser,
        order: 2,
    },
    project_group: {
        label: 'Project group',
        color: 'gray',
        icon: IconUsers,
        order: 3,
    },
};

const sortAssignees = (assignees: RoleAssignee[]): RoleAssignee[] =>
    [...assignees].sort((a, b) => {
        const kindDiff = KIND_META[a.kind].order - KIND_META[b.kind].order;
        if (kindDiff !== 0) return kindDiff;
        return a.assigneeName.localeCompare(b.assigneeName);
    });

const getAssigneeHref = (assignee: RoleAssignee): string | null => {
    switch (assignee.kind) {
        case 'service_account':
            return '/generalSettings/serviceAccounts';
        case 'organization_user':
            return '/generalSettings/userManagement';
        case 'project_user':
        case 'project_group':
            return assignee.projectUuid
                ? `/generalSettings/projectManagement/${assignee.projectUuid}/projectAccess`
                : null;
        default:
            return assertUnreachable(
                assignee.kind,
                'Unknown role assignee kind',
            );
    }
};

export const CustomRolesDeleteModal: FC<DeleteModalProps> = ({
    isOpen,
    onClose,
    onDelete,
    isDeleting = false,
    role,
}) => {
    const { data: assignees, isLoading } = useRoleAssignees(
        isOpen ? role.roleUuid : undefined,
    );

    const sortedAssignees = useMemo(
        () => (assignees ? sortAssignees(assignees) : []),
        [assignees],
    );

    const hasAssignees = sortedAssignees.length > 0;

    return (
        <MantineModal
            opened={isOpen}
            onClose={onClose}
            title={
                hasAssignees ? 'Custom role is assigned' : 'Delete custom role'
            }
            variant="delete"
            resourceType={hasAssignees ? undefined : 'role'}
            resourceLabel={hasAssignees ? undefined : role.name}
            cancelDisabled={isDeleting}
            onConfirm={onDelete}
            confirmDisabled={hasAssignees || isLoading}
            confirmLoading={isDeleting}
        >
            {isLoading ? (
                <Center py="md">
                    <Loader size="sm" />
                </Center>
            ) : hasAssignees ? (
                <Stack gap="md">
                    <Callout variant="warning">
                        This role is currently in use. Unassign it from the
                        items below before you can delete it.
                    </Callout>
                    <Paper withBorder radius="md">
                        <Stack gap={0}>
                            {sortedAssignees.map((assignee, idx) => {
                                const meta = KIND_META[assignee.kind];
                                const href = getAssigneeHref(assignee);
                                return (
                                    <Fragment
                                        key={`${assignee.kind}-${
                                            assignee.assigneeId
                                        }-${assignee.projectUuid ?? 'org'}`}
                                    >
                                        {idx > 0 && <Divider />}
                                        <Group
                                            justify="space-between"
                                            wrap="nowrap"
                                            gap="md"
                                            px="md"
                                            py="sm"
                                        >
                                            <Group
                                                gap="sm"
                                                wrap="nowrap"
                                                style={{
                                                    minWidth: 0,
                                                    flex: 1,
                                                }}
                                            >
                                                <ThemeIcon
                                                    color={meta.color}
                                                    variant="light"
                                                    size="lg"
                                                    radius="xl"
                                                >
                                                    <MantineIcon
                                                        icon={meta.icon}
                                                        size="sm"
                                                    />
                                                </ThemeIcon>
                                                <Box style={{ minWidth: 0 }}>
                                                    {href ? (
                                                        <Anchor
                                                            component={Link}
                                                            to={href}
                                                            onClick={onClose}
                                                            fz="sm"
                                                            fw={500}
                                                            truncate
                                                            c="inherit"
                                                        >
                                                            {
                                                                assignee.assigneeName
                                                            }
                                                        </Anchor>
                                                    ) : (
                                                        <Text
                                                            fz="sm"
                                                            fw={500}
                                                            truncate
                                                        >
                                                            {
                                                                assignee.assigneeName
                                                            }
                                                        </Text>
                                                    )}
                                                    {assignee.projectName && (
                                                        <Text
                                                            fz="xs"
                                                            c="dimmed"
                                                            truncate
                                                        >
                                                            {
                                                                assignee.projectName
                                                            }
                                                        </Text>
                                                    )}
                                                </Box>
                                            </Group>
                                            <Badge
                                                color={meta.color}
                                                variant="light"
                                                size="sm"
                                            >
                                                {meta.label}
                                            </Badge>
                                        </Group>
                                    </Fragment>
                                );
                            })}
                        </Stack>
                    </Paper>
                </Stack>
            ) : (
                <Text fz="sm" c="dimmed">
                    This action cannot be undone. Users and groups will no
                    longer be able to use this role.
                </Text>
            )}
        </MantineModal>
    );
};
