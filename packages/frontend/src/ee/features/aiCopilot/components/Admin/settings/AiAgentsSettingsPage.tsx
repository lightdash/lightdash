import { Group, Stack } from '@mantine-8/core';
import { IconRobotFace } from '@tabler/icons-react';
import LinkButton from '../../../../../../components/common/LinkButton';
import PageBreadcrumbs from '../../../../../../components/common/PageBreadcrumbs';
import { useActiveProjectUuid } from '../../../../../../hooks/useActiveProject';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminAgentsTable from '../AiAgentAdminAgentsTable';
import { AiAgentsAdminProjectDefaultAgent } from '../AiAgentsAdminProjectDefaultAgent';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';

export const AiAgentsSettingsPage = () => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: settings } = useAiOrganizationSettings();

    return (
        <Stack mb="lg" gap="md">
            <Group justify="space-between" align="flex-start">
                <PageBreadcrumbs
                    items={[
                        { title: 'Ask AI', to: '/generalSettings/ai/general' },
                        { title: 'Agents', active: true },
                    ]}
                />
                <LinkButton
                    href={`/projects/${activeProjectUuid}/ai-agents/new`}
                    leftIcon={IconRobotFace}
                    variant="default"
                    radius="md"
                >
                    New Agent
                </LinkButton>
            </Group>

            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentsAdminProjectDefaultAgent />
            <AiAgentAdminAgentsTable />
        </Stack>
    );
};
