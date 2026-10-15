import {
    ProjectMemberRole,
    ProjectMemberRoleLabels,
    type HomepageConfig,
    type HomepageViewAsTarget,
} from '@lightdash/common';
import {
    Badge,
    Group,
    Loader,
    SegmentedControl,
    Select,
    Stack,
    Text,
} from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../hooks/useOrganizationUsers';
import classes from './HomepageEditor.module.css';
import { useHomepageViewAs } from './hooks/useProjectHomepage';
import { PublishedHomepage } from './PublishedHomepage';
import { reasonLabel } from './resolution';

export type HomepageViewType = 'everyone' | 'user' | 'group' | 'role';

// The "Viewing as" switcher — lives in the builder toolbar during preview so
// the canvas below stays the real rendered homepage.
export const ViewAsControl: FC<{
    projectUuid: string;
    viewType: HomepageViewType;
    target: HomepageViewAsTarget | null;
    onViewTypeChange: (viewType: HomepageViewType) => void;
    onTargetChange: (target: HomepageViewAsTarget | null) => void;
}> = ({ projectUuid, viewType, target, onViewTypeChange, onTargetChange }) => {
    const { t } = useTranslation('homepageBuilder');
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
                {t('preview.viewingAs')}
            </Text>
            <SegmentedControl
                size="xs"
                value={viewType}
                onChange={(value) => {
                    onViewTypeChange(value as HomepageViewType);
                    onTargetChange(null);
                }}
                data={[
                    {
                        value: 'everyone',
                        label: t('preview.viewTypes.everyone'),
                    },
                    { value: 'user', label: t('preview.viewTypes.user') },
                    { value: 'group', label: t('preview.viewTypes.group') },
                    { value: 'role', label: t('preview.viewTypes.role') },
                ]}
            />
            {viewType === 'user' && (
                <Select
                    size="xs"
                    placeholder={t('preview.pickUser')}
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
                    placeholder={t('preview.pickGroup')}
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
                    placeholder={t('preview.pickRole')}
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
                <Badge className={classes.viewAsBadge}>
                    {result.data.reason
                        ? t('preview.resolvedWithReason', {
                              name: result.data.resolved.homepage.name,
                              reason: reasonLabel(
                                  result.data.reason,
                                  groupNames,
                              ),
                          })
                        : result.data.resolved.homepage.name}
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
    const { t } = useTranslation('homepageBuilder');
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
                    {t('preview.noHomepageApplies')}
                </Text>
            </Stack>
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
