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
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import classes from './HomepageEditor.module.css';
import { useHomepageViewAs } from './hooks/useProjectHomepage';
import { PublishedHomepage } from './PublishedHomepage';

export type HomepageViewType = 'everyone' | 'user' | 'group' | 'role';

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

// The "Viewing as" switcher — lives in the builder toolbar during preview so
// the canvas below stays the real rendered homepage.
export const ViewAsControl: FC<{
    projectUuid: string;
    viewType: HomepageViewType;
    target: HomepageViewAsTarget | null;
    onViewTypeChange: (viewType: HomepageViewType) => void;
    onTargetChange: (target: HomepageViewAsTarget | null) => void;
}> = ({ projectUuid, viewType, target, onViewTypeChange, onTargetChange }) => {
    const { data: users } = useOrganizationUsers({
        projectUuid,
        enabled: viewType === 'user',
    });
    const { data: groups } = useOrganizationGroups(
        {},
        { enabled: viewType === 'group' || target !== null },
    );
    const result = useHomepageViewAs(projectUuid, target);

    const groupNames = new Map(
        (groups ?? []).map((group) => [group.uuid, group.name]),
    );

    return (
        <Group className={classes.viewAsBar} gap="xs" wrap="nowrap">
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
                onChange={(value) => {
                    onViewTypeChange(value as HomepageViewType);
                    onTargetChange(null);
                }}
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
                    w={220}
                    data={(users ?? []).map((user) => ({
                        value: user.userUuid,
                        label: `${user.firstName} ${user.lastName} (${user.email})`,
                    }))}
                    value={target?.type === 'user' ? target.userUuid : null}
                    onChange={(value) =>
                        onTargetChange(
                            value ? { type: 'user', userUuid: value } : null,
                        )
                    }
                />
            )}
            {viewType === 'group' && (
                <Select
                    size="xs"
                    placeholder="Pick a group"
                    searchable
                    w={200}
                    data={(groups ?? []).map((group) => ({
                        value: group.uuid,
                        label: group.name,
                    }))}
                    value={target?.type === 'group' ? target.groupUuid : null}
                    onChange={(value) =>
                        onTargetChange(
                            value ? { type: 'group', groupUuid: value } : null,
                        )
                    }
                />
            )}
            {viewType === 'role' && (
                <Select
                    size="xs"
                    placeholder="Pick a role"
                    w={160}
                    data={Object.values(ProjectMemberRole).map((role) => ({
                        value: role,
                        label: ProjectMemberRoleLabels[role],
                    }))}
                    value={target?.type === 'role' ? target.role : null}
                    onChange={(value) =>
                        onTargetChange(
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
    );
};

// The preview canvas — the real rendered homepage for the chosen audience.
export const PreviewPane: FC<{
    draft: HomepageConfig;
    projectUuid: string;
    target: HomepageViewAsTarget | null;
}> = ({ draft, projectUuid, target }) => {
    const result = useHomepageViewAs(projectUuid, target);

    if (!target) {
        return <PublishedHomepage config={draft} projectUuid={projectUuid} />;
    }
    if (result.isInitialLoading) {
        return (
            <Group justify="center" p="xl">
                <Loader size="sm" />
            </Group>
        );
    }
    if (result.data?.resolved == null) {
        return (
            <Stack align="center" gap="xs" p="xl">
                <Text size="sm" c="dimmed">
                    No published homepage applies — this viewer lands on the
                    day-one default.
                </Text>
            </Stack>
        );
    }
    if (result.data.resolved.type === 'dashboard') {
        const { dashboardUuid } = result.data.resolved;
        return (
            <Card withBorder p="md" maw={640} mx="auto" mt="xl">
                <Group gap="xs">
                    <Text size="sm">
                        This viewer lands directly on a dashboard.
                    </Text>
                    <Anchor
                        component={Link}
                        to={`/projects/${projectUuid}/dashboards/${dashboardUuid}/view`}
                        target="_blank"
                        size="sm"
                    >
                        <Group gap={4} wrap="nowrap">
                            Open dashboard
                            <MantineIcon icon={IconExternalLink} size="sm" />
                        </Group>
                    </Anchor>
                </Group>
            </Card>
        );
    }
    return (
        <PublishedHomepage
            config={result.data.resolved.homepage.config}
            projectUuid={projectUuid}
            personalPlaceholders
        />
    );
};
