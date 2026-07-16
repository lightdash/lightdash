import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    type HomepageConfig,
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
import { IconExternalLink } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import classes from './HomepageEditor.module.css';
import { useHomepageViewAs } from './hooks/useProjectHomepage';
import { PublishedHomepage } from './PublishedHomepage';

type ViewType = 'everyone' | 'user' | 'group' | 'role';

const reasonLabel = (
    reason: HomepageViewAsReason,
    groupNames: Map<string, string>,
): string => {
    switch (reason.type) {
        case 'personal':
            return 'their personal pick';
        case 'group':
            return `via group ${groupNames.get(reason.groupUuid) ?? 'unknown'} (priority ${reason.priority})`;
        case 'role':
            return `via role ${ProjectMemberRoleLabels[reason.role]}`;
        case 'default':
            return 'org default';
        default:
            return '';
    }
};

// The preview canvas: shows the draft as everyone sees it, with an inline
// "Viewing as" switcher to resolve the homepage a specific user/group/role
// actually lands on (through the real precedence chain).
export const PreviewPane: FC<{
    draft: HomepageConfig;
    projectUuid: string;
}> = ({ draft, projectUuid }) => {
    const [viewType, setViewType] = useState<ViewType>('everyone');
    const [target, setTarget] = useState<HomepageViewAsTarget | null>(null);

    const { data: users } = useOrganizationUsers({
        projectUuid,
        enabled: viewType === 'user',
    });
    const { data: groups } = useOrganizationGroups(
        {},
        { enabled: viewType === 'group' },
    );
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
        setViewType(value as ViewType);
        setTarget(null);
    };

    return (
        <Stack gap="md">
            <Group className={classes.viewAsBar} gap="sm" wrap="nowrap">
                <Text
                    size="xs"
                    fw={600}
                    tt="uppercase"
                    c="dimmed"
                    className={classes.viewAsLabel}
                >
                    Viewing as
                </Text>
                <SegmentedControl
                    size="xs"
                    value={viewType}
                    onChange={handleTypeChange}
                    data={[
                        { value: 'everyone', label: 'Everyone' },
                        { value: 'user', label: 'User' },
                        { value: 'group', label: 'Group' },
                        { value: 'role', label: 'Role' },
                    ]}
                />
                {viewType === 'user' && (
                    <Select
                        size="xs"
                        placeholder="Pick a user"
                        searchable
                        flex={1}
                        data={(users ?? []).map((user) => ({
                            value: user.userUuid,
                            label: `${user.firstName} ${user.lastName} (${user.email})`,
                        }))}
                        value={target?.type === 'user' ? target.userUuid : null}
                        onChange={(value) =>
                            setTarget(
                                value
                                    ? { type: 'user', userUuid: value }
                                    : null,
                            )
                        }
                    />
                )}
                {viewType === 'group' && (
                    <Select
                        size="xs"
                        placeholder="Pick a group"
                        searchable
                        flex={1}
                        data={(groups ?? []).map((group) => ({
                            value: group.uuid,
                            label: group.name,
                        }))}
                        value={
                            target?.type === 'group' ? target.groupUuid : null
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
                {viewType === 'role' && (
                    <Select
                        size="xs"
                        placeholder="Pick a role"
                        flex={1}
                        data={Object.values(ProjectMemberRole).map((role) => ({
                            value: role,
                            label: ProjectMemberRoleLabels[role],
                        }))}
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
                {target && result.data?.resolved?.type === 'homepage' && (
                    <Badge
                        variant="light"
                        tt="none"
                        className={classes.viewAsBadge}
                    >
                        {result.data.resolved.homepage.name}
                        {result.data.reason
                            ? ` · ${reasonLabel(result.data.reason, groupNames)}`
                            : ''}
                    </Badge>
                )}
            </Group>

            {!target ? (
                <PublishedHomepage config={draft} projectUuid={projectUuid} />
            ) : result.isInitialLoading ? (
                <Group justify="center" p="xl">
                    <Loader size="sm" />
                </Group>
            ) : result.data?.resolved == null ? (
                <Card withBorder p="md">
                    <Text size="sm" c="dimmed">
                        No published homepage applies to {targetLabel} — they
                        land on the day-one default.
                    </Text>
                </Card>
            ) : result.data.resolved.type === 'dashboard' ? (
                <Card withBorder p="md">
                    <Group gap="xs">
                        <Text size="sm">
                            {targetLabel} lands directly on a dashboard
                            {result.data.reason
                                ? ` (${reasonLabel(result.data.reason, groupNames)})`
                                : ''}
                            .
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
            ) : (
                <PublishedHomepage
                    config={result.data.resolved.homepage.config}
                    projectUuid={projectUuid}
                    personalPlaceholders
                />
            )}
        </Stack>
    );
};
