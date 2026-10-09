import { subject } from '@casl/ability';
import { FeatureFlags, WarehouseTypes, type Project } from '@lightdash/common';
import { Anchor, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { SettingsCard } from '../../components/common/Settings/SettingsCard';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { AiServiceAccountCard } from './AiServiceAccountCard';
import { useOrganizationAgentIdentitySettings } from './api';
import { identityLabels } from './identityLabels';

const ProjectAgentIdentityContent = ({ project }: { project: Project }) => {
    const settings = useOrganizationAgentIdentitySettings();
    const rule = settings.data?.rules.find(
        ({ warehouseType }) =>
            warehouseType === project.warehouseConnection?.type,
    );
    if (settings.isLoading) return <EmptyStateLoader />;
    if (settings.isError || !rule)
        return (
            <InlineErrorState
                message="Could not load the organization rule."
                onRetry={() => void settings.refetch()}
            />
        );
    return (
        <Stack gap="lg">
            <SettingsCard>
                <Stack gap="xs">
                    <Title order={5}>
                        Organization rule for this warehouse
                    </Title>
                    <Text size="sm">{identityLabels[rule.source].label}</Text>
                    <Text size="sm" c="dimmed">
                        {identityLabels[rule.source].helper}
                    </Text>
                    <Text size="sm" c="dimmed">
                        Set by an organization admin.{' '}
                        <Anchor
                            component={Link}
                            to="/generalSettings/warehouseCredentials"
                            size="sm"
                        >
                            Organization settings
                        </Anchor>
                    </Text>
                </Stack>
            </SettingsCard>
            <AiServiceAccountCard project={project} />
        </Stack>
    );
};

export const ProjectAgentIdentityPage = ({ project }: { project: Project }) => {
    const { data: flag } = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const ability = useAbilityContext();
    if (
        !flag?.enabled ||
        !ability.can(
            'manage',
            subject('Project', {
                organizationUuid: project.organizationUuid,
                projectUuid: project.projectUuid,
            }),
        )
    )
        return null;
    if (
        project.warehouseConnection?.type !== WarehouseTypes.BIGQUERY &&
        project.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE
    )
        return (
            <Text size="sm" c="dimmed">
                Agent identity is not available for this warehouse.
            </Text>
        );
    return (
        <ProjectAgentIdentityContent
            key={project.projectUuid}
            project={project}
        />
    );
};
