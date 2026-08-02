import { IconRobotFace } from '@tabler/icons-react';
import LinkButton from '../../../../../../components/common/LinkButton';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useActiveProjectUuid } from '../../../../../../hooks/useActiveProject';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminAgentsTable from '../AiAgentAdminAgentsTable';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';

export const AiAgentsSettingsPage = () => {
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: settings } = useAiOrganizationSettings();

    return (
        <SettingsPage
            title="Agents"
            description="Manage the AI agents available across your organization."
            actions={
                <LinkButton
                    href={`/projects/${activeProjectUuid}/ai-agents/new`}
                    leftIcon={IconRobotFace}
                    variant="default"
                    radius="md"
                    size="xs"
                >
                    New Agent
                </LinkButton>
            }
        >
            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentAdminAgentsTable />
        </SettingsPage>
    );
};
