import { subject } from '@casl/ability';
import {
    FeatureFlags,
    supportsAiServiceAccount,
    type Project,
} from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import { AiServiceAccountCard } from './AiServiceAccountCard';

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
            {project.warehouseConnection &&
            supportsAiServiceAccount(project.warehouseConnection.type) ? (
                <AiServiceAccountCard
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
