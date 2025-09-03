import Page from '../../../../components/common/Page/Page';
import { AiAgentsAdminLayout } from '../../../features/aiCopilot/components/Admin/AiAgentsAdminLayout';
import { AiAgentThreadStreamStoreProvider } from '../../../features/aiCopilot/streaming/AiAgentThreadStreamStoreProvider';

export const AiAgentsAdminPage = () => (
    <AiAgentThreadStreamStoreProvider>
        <Page title="AI Agents Admin" noContentPadding>
            <AiAgentsAdminLayout />
        </Page>
    </AiAgentThreadStreamStoreProvider>
);
