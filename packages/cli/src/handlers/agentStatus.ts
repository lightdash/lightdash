import GlobalState from '../globalState';
import {
    getAgentAccess,
    resolveAgentProject,
    type AgentOptions,
} from './agentAccess';

export const agentStatusHandler = async (
    options: AgentOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const access = await getAgentAccess(
        await resolveAgentProject(options.project),
    );
    if (access.refusal === null && access.identity === 'connected_person') {
        console.error(
            `Agent connected${access.expiresAt ? `, expires ${new Date(access.expiresAt).toISOString()}` : ''}`,
        );
        return;
    }
    if (access.requirementSource === null) {
        console.error('Agent sign-in is not required for this project');
        return;
    }
    if (access.refusal?.action === 'sign_in') {
        console.error(`Agent not connected: ${access.refusal.message}`);
        if (access.refusal.connectUrl) console.error(access.refusal.connectUrl);
    } else {
        console.error(access.refusal?.message ?? 'Agent not connected');
    }
    process.exitCode = 1;
};
