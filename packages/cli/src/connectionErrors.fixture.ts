import { runWithAgentConnectionSelection } from './credentials';
import { errorHandler } from './errorHandler.fixture';
import GlobalState from './globalState';
import { agentConnectionConnectHandler } from './handlers/agentConnectionConnect';
import { agentRevokeHandler } from './handlers/agentRevoke';
import { agentStatusHandler } from './handlers/agentStatus';
import { lightdashApi } from './handlers/dbt/apiClient';

const mode = process.argv[2];
if (mode === 'command') {
    GlobalState.setVerbose(true);
    const command = process.argv[3];
    const run = async () => {
        switch (command) {
            case 'connect':
                return agentConnectionConnectHandler({ verbose: true });
            case 'status':
                return agentStatusHandler({ name: 'default', verbose: true });
            case 'revoke':
                return agentRevokeHandler({ name: 'default' });
            case 'request':
                return runWithAgentConnectionSelection('default', () =>
                    lightdashApi({
                        method: 'GET',
                        url: '/api/v1/user',
                        body: undefined,
                    }),
                );
            default:
                return lightdashApi({
                    method: 'GET',
                    url: '/api/v1/org/projects',
                    body: undefined,
                });
        }
    };
    void run().catch(errorHandler);
}
