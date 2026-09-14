import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import AiAgentAdminMemoriesTable from '../AiAgentAdminMemoriesTable';

export const AiMemoriesSettingsPage = () => (
    <SettingsPage
        title="Memories"
        description="Audit what your AI agents have learned across projects."
    >
        <AiAgentAdminMemoriesTable />
    </SettingsPage>
);
