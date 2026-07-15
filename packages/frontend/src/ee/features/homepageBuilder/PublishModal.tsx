import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    type Group as OrgGroup,
    type HomepageAssignment,
    type HomepageAudience,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Checkbox,
    Group,
    SegmentedControl,
    Stack,
    Switch,
    Text,
} from '@mantine-8/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconChevronRight,
    IconSend,
    IconShieldCheck,
    IconUsersGroup,
    IconWorld,
    IconWorldCheck,
} from '@tabler/icons-react';
import { useRef, useState, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { MiniPill } from './blocks/BlockShell';
import blockClasses from './blocks/blockStyles.module.css';
import {
    useHomepageAssignments,
    useUpdateGroupPriorities,
} from './hooks/useProjectHomepage';

const RESOLUTION_STEPS = ['Personal', 'Group priority', 'Role', 'Org default'];

const ROLE_DESCRIPTIONS: Record<ProjectMemberRole, string> = {
    [ProjectMemberRole.VIEWER]: 'Read-only consumers of dashboards',
    [ProjectMemberRole.INTERACTIVE_VIEWER]:
        'Can explore data behind the dashboards',
    [ProjectMemberRole.EDITOR]: 'Builds charts and dashboards',
    [ProjectMemberRole.DEVELOPER]: 'Works on the data model itself',
    [ProjectMemberRole.ADMIN]: 'Full control of the project',
};

const segmentedLabel = (icon: typeof IconWorld, label: string) => (
    <Group gap={5} justify="center" wrap="nowrap">
        <MantineIcon icon={icon} size={15} />
        {label}
    </Group>
);

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    homepageUuid: string;
    homepageName: string;
    isPublishing: boolean;
    initialAllowPersonal: boolean;
    onPublish: (audience: HomepageAudience, allowPersonal: boolean) => void;
};

// Thin loader: PublishModal itself stays mounted for the lifetime of the
// editor (only `opened` toggles), so it can't seed form state from props at
// mount time. It waits for assignments to load, then mounts PublishModalBody
// keyed on an open-epoch counter — a fresh instance (fresh useState) every
// time the modal is opened, seeded from that session's real assignments.
export const PublishModal: FC<Props> = (props) => {
    const { opened, onClose, projectUuid } = props;
    const { data: groups } = useOrganizationGroups({}, { enabled: opened });
    const { data: assignments, isInitialLoading: assignmentsLoading } =
        useHomepageAssignments(projectUuid, { enabled: opened });
    const { mutate: reorderGroups } = useUpdateGroupPriorities(projectUuid);

    const openEpochRef = useRef(0);
    const wasOpenedRef = useRef(opened);
    if (opened && !wasOpenedRef.current) {
        openEpochRef.current += 1;
    }
    wasOpenedRef.current = opened;

    if (opened && (assignmentsLoading || !assignments)) {
        return (
            <MantineModal
                opened={opened}
                onClose={onClose}
                title="Publish homepage"
                icon={IconSend}
                size="lg"
            />
        );
    }

    return (
        <PublishModalBody
            key={`${props.homepageUuid}-${openEpochRef.current}`}
            {...props}
            groups={groups ?? []}
            assignments={assignments ?? []}
            reorderGroups={reorderGroups}
        />
    );
};

type BodyProps = Props & {
    groups: OrgGroup[];
    assignments: HomepageAssignment[];
    reorderGroups: (groupUuids: string[]) => void;
};

const PublishModalBody: FC<BodyProps> = ({
    opened,
    onClose,
    homepageUuid,
    homepageName,
    isPublishing,
    initialAllowPersonal,
    onPublish,
    groups,
    assignments,
    reorderGroups,
}) => {
    const ownAssignments = assignments.filter(
        (assignment) => assignment.homepageUuid === homepageUuid,
    );
    const initialMode = ownAssignments.some((a) => a.targetType === 'group')
        ? 'groups'
        : ownAssignments.some((a) => a.targetType === 'role')
          ? 'roles'
          : 'everyone';

    const [mode, setMode] = useState<string>(initialMode);
    const [allowPersonal, setAllowPersonal] = useState(initialAllowPersonal);
    const [selectedGroups, setSelectedGroups] = useState<string[]>(() =>
        ownAssignments
            .filter((a) => a.targetType === 'group')
            .flatMap((a) => (a.groupUuid ? [a.groupUuid] : [])),
    );
    const [selectedRoles, setSelectedRoles] = useState<ProjectMemberRole[]>(
        () =>
            ownAssignments
                .filter((a) => a.targetType === 'role')
                .flatMap((a) => (a.role ? [a.role] : [])),
    );

    const groupAssignments = assignments.filter(
        (assignment) => assignment.targetType === 'group',
    );
    const assignmentByGroup = new Map(
        groupAssignments.map((assignment) => [
            assignment.groupUuid,
            assignment,
        ]),
    );
    const assignmentByRole = new Map(
        assignments
            .filter((assignment) => assignment.targetType === 'role')
            .map((assignment) => [assignment.role, assignment]),
    );

    const elsewhereBadge = (assignment: HomepageAssignment | undefined) =>
        assignment && assignment.homepageUuid !== homepageUuid ? (
            <MiniPill>now on {assignment.homepageName}</MiniPill>
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
            onPublish(
                { type: 'groups', groupUuids: selectedGroups },
                allowPersonal,
            );
        } else if (mode === 'roles') {
            onPublish({ type: 'roles', roles: selectedRoles }, allowPersonal);
        } else {
            onPublish({ type: 'everyone' }, allowPersonal);
        }
    };

    const confirmLabel =
        mode === 'groups'
            ? selectedGroups.length > 0
                ? `Publish to ${selectedGroups.length} group${
                      selectedGroups.length === 1 ? '' : 's'
                  }`
                : 'Publish'
            : mode === 'roles'
              ? selectedRoles.length > 0
                  ? `Publish to ${selectedRoles.length} role${
                        selectedRoles.length === 1 ? '' : 's'
                    }`
                  : 'Publish'
              : 'Publish to everyone';

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Publish homepage"
            icon={IconSend}
            size="lg"
            onConfirm={handlePublish}
            confirmLabel={confirmLabel}
            confirmLoading={isPublishing}
            confirmDisabled={
                (mode === 'groups' && selectedGroups.length === 0) ||
                (mode === 'roles' && selectedRoles.length === 0)
            }
        >
            <Stack gap="md">
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
                        {
                            value: 'everyone',
                            label: segmentedLabel(IconWorld, 'Everyone'),
                        },
                        {
                            value: 'groups',
                            label: segmentedLabel(IconUsersGroup, 'By group'),
                        },
                        {
                            value: 'roles',
                            label: segmentedLabel(IconShieldCheck, 'By role'),
                        },
                    ]}
                />

                {mode === 'everyone' && (
                    <Box
                        p={14}
                        style={{
                            border: '1px solid var(--mantine-color-ldGray-2)',
                            borderRadius: 10,
                            background: 'var(--mantine-color-ldGray-0)',
                        }}
                    >
                        <Group gap={10} align="flex-start" wrap="nowrap">
                            <MantineIcon
                                icon={IconWorldCheck}
                                size={18}
                                color="green"
                                style={{ marginTop: 1, flexShrink: 0 }}
                            />
                            <Text size="sm" c="ldGray.7" lh={1.5}>
                                This becomes the{' '}
                                <Text span fw={600} c="inherit">
                                    starting point
                                </Text>{' '}
                                everyone lands on — unless a group they’re in
                                has its own homepage, or they’ve set a personal
                                one.
                            </Text>
                        </Group>
                    </Box>
                )}

                {mode === 'groups' && (
                    <>
                        <div className={blockClasses.listCard}>
                            {groups.map((group) => (
                                <label
                                    key={group.uuid}
                                    className={blockClasses.listRow}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <Checkbox
                                        size="xs"
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
                                    <MantineIcon
                                        icon={IconUsersGroup}
                                        size={16}
                                        color="ldGray.6"
                                    />
                                    <Text
                                        fz={13.5}
                                        fw={500}
                                        style={{ flex: 1 }}
                                    >
                                        {group.name}
                                    </Text>
                                    {elsewhereBadge(
                                        assignmentByGroup.get(group.uuid),
                                    )}
                                </label>
                            ))}
                            {groups.length === 0 && (
                                <Text size="sm" c="dimmed" p="sm">
                                    No groups in this organization yet.
                                </Text>
                            )}
                        </div>
                        {groupAssignments.length > 1 && (
                            <Box
                                p="sm"
                                style={{
                                    border: '1px solid var(--mantine-color-ldGray-2)',
                                    borderRadius: 10,
                                }}
                            >
                                <Text
                                    fz={11}
                                    fw={600}
                                    tt="uppercase"
                                    lts="0.05em"
                                    c="ldGray.6"
                                    mb={4}
                                >
                                    If someone’s in more than one group
                                </Text>
                                <Text fz={12.5} c="dimmed" lh={1.45} mb={10}>
                                    The higher-ranked group’s homepage wins.
                                </Text>
                                <Stack gap={6}>
                                    {groupAssignments.map(
                                        (assignment, index) => (
                                            <Group
                                                key={assignment.assignmentUuid}
                                                gap={10}
                                                wrap="nowrap"
                                                p="8px 10px"
                                                style={{
                                                    border: '1px solid var(--mantine-color-ldGray-2)',
                                                    borderRadius: 8,
                                                    background:
                                                        'var(--mantine-color-ldGray-0)',
                                                }}
                                            >
                                                <span
                                                    className={
                                                        blockClasses.rankBadge
                                                    }
                                                >
                                                    {index + 1}
                                                </span>
                                                <Box style={{ flex: 1 }}>
                                                    <Text fz={13} fw={500}>
                                                        {assignment.groupName}
                                                    </Text>
                                                    <Text fz={11.5} c="dimmed">
                                                        →{' '}
                                                        {
                                                            assignment.homepageName
                                                        }
                                                    </Text>
                                                </Box>
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
                            </Box>
                        )}
                    </>
                )}

                {mode === 'roles' && (
                    <>
                        <div className={blockClasses.listCard}>
                            {Object.values(ProjectMemberRole).map((role) => (
                                <label
                                    key={role}
                                    className={blockClasses.listRow}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <Checkbox
                                        size="xs"
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
                                    <MantineIcon
                                        icon={IconShieldCheck}
                                        size={16}
                                        color="ldGray.6"
                                    />
                                    <Box style={{ flex: 1 }}>
                                        <Text fz={13.5} fw={500}>
                                            {ProjectMemberRoleLabels[role]}
                                        </Text>
                                        <Text fz={12} c="dimmed">
                                            {ROLE_DESCRIPTIONS[role]}
                                        </Text>
                                    </Box>
                                    {elsewhereBadge(assignmentByRole.get(role))}
                                </label>
                            ))}
                        </div>
                        <Text fz={12} c="dimmed" lh={1.45}>
                            A group assignment always wins over a role, and a
                            personal choice wins over both.
                        </Text>
                    </>
                )}

                <Group
                    gap={7}
                    p="10px 12px"
                    style={{
                        background: 'var(--mantine-color-ldGray-0)',
                        borderRadius: 9,
                    }}
                >
                    <Text fz={11.5} fw={500} c="ldGray.5">
                        Resolves:
                    </Text>
                    {RESOLUTION_STEPS.map((step, index) => (
                        <Group key={step} gap={7} wrap="nowrap">
                            <MiniPill>{step}</MiniPill>
                            {index < RESOLUTION_STEPS.length - 1 && (
                                <MantineIcon
                                    icon={IconChevronRight}
                                    size={12}
                                    color="ldGray.5"
                                />
                            )}
                        </Group>
                    ))}
                </Group>

                <Box
                    p="11px 13px"
                    style={{
                        border: '1px solid var(--mantine-color-ldGray-2)',
                        borderRadius: 10,
                    }}
                >
                    <Switch
                        label="Allow personal customization"
                        description="Viewers can favorite items or set a dashboard as their own homepage."
                        checked={allowPersonal}
                        onChange={(e) =>
                            setAllowPersonal(e.currentTarget.checked)
                        }
                    />
                </Box>
            </Stack>
        </MantineModal>
    );
};
