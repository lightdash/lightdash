import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { useAiOrganizationSettings } from '../../../hooks/useAiOrganizationSettings';
import AiAgentAdminEvalsTable from '../AiAgentAdminEvalsTable';
import { AiFeaturesDisabledAlert } from './AiFeaturesDisabledAlert';

export const AiEvalsSettingsPage = () => {
    const { data: settings } = useAiOrganizationSettings();

    return (
        <SettingsPage
            title="Evals"
            description="Monitor agent evaluations across your organization."
        >
            {settings?.aiAgentsVisible === false && <AiFeaturesDisabledAlert />}

            <AiAgentAdminEvalsTable />
        </SettingsPage>
    );
};
