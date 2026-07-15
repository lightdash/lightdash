import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    type HomepageViewAsReason,
    type HomepageViewAsTarget,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Card,
    Group,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Text,
} from '@mantine-8/core';
import { IconExternalLink, IconEye } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import { useHomepageViewAs } from './hooks/useProjectHomepage';
import { PublishedHomepage } from './PublishedHomepage';

const reasonLabel = (
    reason: HomepageViewAsReason,
    groupNames: Map<string, string>,
): string => {
    switch (reason.type) {
        case 'personal':
            return 'their personal pick';
        case 'group':
            return `via group ${
                groupNames.get(reason.groupUuid) ?? 'unknown'
            } (priority ${reason.priority})`;
        case 'role':
            return `via role ${ProjectMemberRoleLabels[reason.role]}`;
        case 'default':
            return 'org default';
        default:
            return '';
    }
};

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
};

export const ViewAsModal: FC<Props> = ({ opened, onClose, projectUuid }) => {
    const [targetType, setTargetType] = useState<string>('user');
    const [target, setTarget] = useState<HomepageViewAsTarget | null>(null);
    const { data: users } = useOrganizationUsers({
        projectUuid,
        enabled: opened,
    });
    const { data: groups } = useOrganizationGroups({}, { enabled: opened });
    const result = useHomepageViewAs(projectUuid, target);

    const groupNames = new Map(
        (groups ?? []).map((group) => [group.uuid, group.name]),
    );
    const targetLabel =
        target?.type === 'user'
            ? (users ?? []).find((user) => user.userUuid === target.userUuid)
                  ?.email
            : target?.type === 'group'
              ? groupNames.get(target.groupUuid)
              : target?.type === 'role'
                ? ProjectMemberRoleLabels[target.role]
                : undefined;

    const handleTypeChange = (value: string) => {
        setTargetType(value);
        setTarget(null);
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="View homepage as"
            icon={IconEye}
            size="xl"
        >
            <Stack gap="sm">
                <Text size="sm" c="dimmed">
                    Preview which homepage an audience lands on, resolved
                    through the real precedence chain (personal → group priority
                    → role → org default).
                </Text>
                <Group gap="sm" wrap="nowrap">
                    <SegmentedControl
                        value={targetType}
                        onChange={handleTypeChange}
                        data={[
                            { value: 'user', label: 'User' },
                            { value: 'group', label: 'Group' },
                            { value: 'role', label: 'Role' },
                        ]}
                    />
                    {targetType === 'user' && (
                        <Select
                            placeholder="Pick a user"
                            searchable
                            style={{ flex: 1 }}
                            data={(users ?? []).map((user) => ({
                                value: user.userUuid,
                                label: `${user.firstName} ${user.lastName} (${user.email})`,
                            }))}
                            value={
                                target?.type === 'user' ? target.userUuid : null
                            }
                            onChange={(value) =>
                                setTarget(
                                    value
                                        ? { type: 'user', userUuid: value }
                                        : null,
                                )
                            }
                        />
                    )}
                    {targetType === 'group' && (
                        <Select
                            placeholder="Pick a group"
                            searchable
                            style={{ flex: 1 }}
                            data={(groups ?? []).map((group) => ({
                                value: group.uuid,
                                label: group.name,
                            }))}
                            value={
                                target?.type === 'group'
                                    ? target.groupUuid
                                    : null
                            }
                            onChange={(value) =>
                                setTarget(
                                    value
                                        ? { type: 'group', groupUuid: value }
                                        : null,
                                )
                            }
                        />
                    )}
                    {targetType === 'role' && (
                        <Select
                            placeholder="Pick a role"
                            style={{ flex: 1 }}
                            data={Object.values(ProjectMemberRole).map(
                                (role) => ({
                                    value: role,
                                    label: ProjectMemberRoleLabels[role],
                                }),
                            )}
                            value={target?.type === 'role' ? target.role : null}
                            onChange={(value) =>
                                setTarget(
                                    value
                                        ? {
                                              type: 'role',
                                              role: value as ProjectMemberRole,
                                          }
                                        : null,
                                )
                            }
                        />
                    )}
                </Group>

                {target && result.isInitialLoading && (
                    <Group justify="center" p="lg">
                        <Loader size="sm" />
                    </Group>
                )}

                {target && result.data && (
                    <>
                        {result.data.resolved === null && (
                            <Card withBorder p="md">
                                <Text size="sm" c="dimmed">
                                    No published homepage applies — they land on
                                    the day-one default.
                                </Text>
                            </Card>
                        )}
                        {result.data.resolved?.type === 'dashboard' && (
                            <Card withBorder p="md">
                                <Group gap="xs">
                                    <Text size="sm">
                                        Lands directly on a dashboard (
                                        {result.data.reason &&
                                            reasonLabel(
                                                result.data.reason,
                                                groupNames,
                                            )}
                                        ).
                                    </Text>
                                    <Anchor
                                        component={Link}
                                        to={`/projects/${projectUuid}/dashboards/${result.data.resolved.dashboardUuid}/view`}
                                        target="_blank"
                                        size="sm"
                                    >
                                        <Group gap={4} wrap="nowrap">
                                            Open dashboard
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size="sm"
                                            />
                                        </Group>
                                    </Anchor>
                                </Group>
                            </Card>
                        )}
                        {result.data.resolved?.type === 'homepage' && (
                            <Stack gap="sm">
                                <Group gap="xs">
                                    <Badge variant="filled" tt="none">
                                        Viewing as {targetLabel}
                                    </Badge>
                                    <Text size="sm" c="dimmed">
                                        sees{' '}
                                        <Text span fw={600} c="inherit">
                                            {result.data.resolved.homepage.name}
                                        </Text>{' '}
                                        {result.data.reason &&
                                            `· ${reasonLabel(
                                                result.data.reason,
                                                groupNames,
                                            )}`}
                                    </Text>
                                </Group>
                                <Card withBorder p="lg">
                                    <PublishedHomepage
                                        config={
                                            result.data.resolved.homepage.config
                                        }
                                        projectUuid={projectUuid}
                                        personalPlaceholders
                                    />
                                </Card>
                            </Stack>
                        )}
                    </>
                )}
            </Stack>
        </MantineModal>
    );
};
