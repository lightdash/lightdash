import { subject } from '@casl/ability';
import {
    FeatureFlags,
    supportsAiServiceAccount,
    type Project,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { AgentWarehouseConfirmationCard } from './AgentWarehouseConfirmationCard';
import { AiServiceAccountCard } from './AiServiceAccountCard';
import { useOrganizationAgentIdentitySettings } from './api';

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
    return <AiServiceAccountCard project={project} />;
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
    return (
        <Stack gap="lg">
            <AgentWarehouseConfirmationCard
                key={project.projectUuid}
                projectUuid={project.projectUuid}
            />
            {project.warehouseConnection &&
            supportsAiServiceAccount(project.warehouseConnection.type) ? (
                <ProjectAgentIdentityContent
                    key={project.projectUuid}
                    project={project}
                />
            ) : (
                <Text size="sm" c="dimmed">
                    Agent identity is not available for this warehouse.
                </Text>
            )}
        </Stack>
    );
};
