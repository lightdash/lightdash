import { IconRobotFace } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import LinkButton from '../../../../../../components/common/LinkButton';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useActiveProjectUuid } from '../../../../../../hooks/useActiveProject';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminAgentsTable from '../AiAgentAdminAgentsTable';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';

export const AiAgentsSettingsPage = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: settings } = useAiOrganizationSettings();

    return (
        <SettingsPage
            title={t('settings.agents.title')}
            description={t('settings.agents.description')}
            actions={
                <LinkButton
                    href={`/projects/${activeProjectUuid}/ai-agents/new`}
                    leftIcon={IconRobotFace}
                    variant="default"
                    radius="md"
                    size="xs"
                >
                    {t('settings.agents.newAgent')}
                </LinkButton>
            }
        >
            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentAdminAgentsTable />
        </SettingsPage>
    );
};
