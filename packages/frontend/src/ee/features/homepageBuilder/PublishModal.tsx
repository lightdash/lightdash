import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    type HomepageAssignment,
    type HomepageAudience,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Card,
    Checkbox,
    Group,
    SegmentedControl,
    Stack,
    Text,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconChevronRight,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import {
    useHomepageAssignments,
    useUpdateGroupPriorities,
} from './hooks/useProjectHomepage';

const RESOLUTION_STEPS = ['Personal', 'Group priority', 'Role', 'Org default'];

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    homepageUuid: string;
    homepageName: string;
    isPublishing: boolean;
    onPublish: (audience: HomepageAudience) => void;
};

export const PublishModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    homepageUuid,
    homepageName,
    isPublishing,
    onPublish,
}) => {
    const [mode, setMode] = useState<string>('everyone');
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [selectedRoles, setSelectedRoles] = useState<ProjectMemberRole[]>([]);
    const { data: groups } = useOrganizationGroups({}, { enabled: opened });
    const { data: assignments } = useHomepageAssignments(projectUuid, {
        enabled: opened,
    });
    const { mutate: reorderGroups } = useUpdateGroupPriorities(projectUuid);

    const groupAssignments = (assignments ?? []).filter(
        (assignment) => assignment.targetType === 'group',
    );
    const assignmentByGroup = new Map(
        groupAssignments.map((assignment) => [
            assignment.groupUuid,
            assignment,
        ]),
    );
    const assignmentByRole = new Map(
        (assignments ?? [])
            .filter((assignment) => assignment.targetType === 'role')
            .map((assignment) => [assignment.role, assignment]),
    );

    const elsewhereBadge = (assignment: HomepageAssignment | undefined) =>
        assignment && assignment.homepageUuid !== homepageUuid ? (
            <Badge variant="default" size="xs" tt="none">
                now on {assignment.homepageName}
            </Badge>
        ) : null;

    const movePriority = (groupUuid: string, direction: -1 | 1) => {
        const order = groupAssignments.map(
            (assignment) => assignment.groupUuid,
        );
        const index = order.indexOf(groupUuid);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= order.length) return;
        [order[index], order[target]] = [order[target], order[index]];
        reorderGroups(order.flatMap((uuid) => (uuid ? [uuid] : [])));
    };

    const handlePublish = () => {
        if (mode === 'groups') {
            onPublish({ type: 'groups', groupUuids: selectedGroups });
        } else if (mode === 'roles') {
            onPublish({ type: 'roles', roles: selectedRoles });
        } else {
            onPublish({ type: 'everyone' });
        }
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Publish homepage"
            size="lg"
            onConfirm={handlePublish}
            confirmLoading={isPublishing}
            confirmDisabled={
                (mode === 'groups' && selectedGroups.length === 0) ||
                (mode === 'roles' && selectedRoles.length === 0)
            }
        >
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Choose who lands on{' '}
                    <Text span fw={600} c="inherit">
                        {homepageName}
                    </Text>{' '}
                    when they open this project.
                </Text>
                <SegmentedControl
                    fullWidth
                    value={mode}
                    onChange={setMode}
                    data={[
                        { value: 'everyone', label: 'Everyone' },
                        { value: 'groups', label: 'By group' },
                        { value: 'roles', label: 'By role' },
                    ]}
                />

                {mode === 'everyone' && (
                    <Card withBorder p="sm">
                        <Text size="sm" c="dimmed">
                            This becomes the starting point everyone lands on —
                            unless a group they’re in has its own homepage.
                        </Text>
                    </Card>
                )}

                {mode === 'groups' && (
                    <>
                        <Card withBorder p="sm">
                            <Stack gap="xs">
                                {(groups ?? []).map((group) => (
                                    <Group
                                        key={group.uuid}
                                        gap="sm"
                                        wrap="nowrap"
                                    >
                                        <Checkbox
                                            label={group.name}
                                            checked={selectedGroups.includes(
                                                group.uuid,
                                            )}
                                            onChange={(e) =>
                                                setSelectedGroups(
                                                    e.currentTarget.checked
                                                        ? [
                                                              ...selectedGroups,
                                                              group.uuid,
                                                          ]
                                                        : selectedGroups.filter(
                                                              (uuid) =>
                                                                  uuid !==
                                                                  group.uuid,
                                                          ),
                                                )
                                            }
                                        />
                                        {elsewhereBadge(
                                            assignmentByGroup.get(group.uuid),
                                        )}
                                    </Group>
                                ))}
                                {(groups ?? []).length === 0 && (
                                    <Text size="sm" c="dimmed">
                                        No groups in this organization yet.
                                    </Text>
                                )}
                            </Stack>
                        </Card>
                        {groupAssignments.length > 1 && (
                            <Card withBorder p="sm">
                                <Stack gap="xs">
                                    <Text size="xs" fw={600} c="dimmed">
                                        If someone’s in more than one group, the
                                        higher-ranked group wins
                                    </Text>
                                    {groupAssignments.map(
                                        (assignment, index) => (
                                            <Group
                                                key={assignment.assignmentUuid}
                                                gap="xs"
                                                wrap="nowrap"
                                            >
                                                <Badge
                                                    variant="filled"
                                                    size="sm"
                                                >
                                                    {index + 1}
                                                </Badge>
                                                <Text
                                                    size="sm"
                                                    style={{ flex: 1 }}
                                                >
                                                    {assignment.groupName} →{' '}
                                                    {assignment.homepageName}
                                                </Text>
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    size="sm"
                                                    disabled={index === 0}
                                                    aria-label={`Move ${assignment.groupName} up`}
                                                    onClick={() =>
                                                        assignment.groupUuid &&
                                                        movePriority(
                                                            assignment.groupUuid,
                                                            -1,
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconArrowUp}
                                                    />
                                                </ActionIcon>
                                                <ActionIcon
                                                    variant="subtle"
                                                    color="gray"
                                                    size="sm"
                                                    disabled={
                                                        index ===
                                                        groupAssignments.length -
                                                            1
                                                    }
                                                    aria-label={`Move ${assignment.groupName} down`}
                                                    onClick={() =>
                                                        assignment.groupUuid &&
                                                        movePriority(
                                                            assignment.groupUuid,
                                                            1,
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconArrowDown}
                                                    />
                                                </ActionIcon>
                                            </Group>
                                        ),
                                    )}
                                </Stack>
                            </Card>
                        )}
                    </>
                )}

                {mode === 'roles' && (
                    <Card withBorder p="sm">
                        <Stack gap="xs">
                            {Object.values(ProjectMemberRole).map((role) => (
                                <Group key={role} gap="sm" wrap="nowrap">
                                    <Checkbox
                                        label={ProjectMemberRoleLabels[role]}
                                        checked={selectedRoles.includes(role)}
                                        onChange={(e) =>
                                            setSelectedRoles(
                                                e.currentTarget.checked
                                                    ? [...selectedRoles, role]
                                                    : selectedRoles.filter(
                                                          (r) => r !== role,
                                                      ),
                                            )
                                        }
                                    />
                                    {elsewhereBadge(assignmentByRole.get(role))}
                                </Group>
                            ))}
                            <Text size="xs" c="dimmed">
                                A group assignment always wins over a role.
                            </Text>
                        </Stack>
                    </Card>
                )}

                <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed">
                        Resolves:
                    </Text>
                    {RESOLUTION_STEPS.map((step, index) => (
                        <Group key={step} gap={4} wrap="nowrap">
                            <Badge variant="default" size="xs" tt="none">
                                {step}
                            </Badge>
                            {index < RESOLUTION_STEPS.length - 1 && (
                                <MantineIcon
                                    icon={IconChevronRight}
                                    size="sm"
                                    color="gray"
                                />
                            )}
                        </Group>
                    ))}
                </Group>
            </Stack>
        </MantineModal>
    );
};
