import { Provider } from 'react-redux';
import Page from '../../../../components/common/Page/Page';
import { AiAgentsAdminLayout } from '../../../features/aiCopilot/components/Admin/AiAgentsAdminLayout';
import { store } from '../../../features/aiCopilot/store';
import { AiAgentThreadStreamAbortControllerContextProvider } from '../../../features/aiCopilot/streaming/AiAgentThreadStreamAbortControllerContextProvider';

export const AiAgentsAdminPage = () => (
    <Provider store={store}>
        <AiAgentThreadStreamAbortControllerContextProvider>
            <Page title="AI Agents Admin" noContentPadding>
                <AiAgentsAdminLayout />
            </Page>
        </AiAgentThreadStreamAbortControllerContextProvider>
    </Provider>
);
