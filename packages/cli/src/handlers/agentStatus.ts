import { type AiAccessForUser } from '@lightdash/common';
import GlobalState from '../globalState';
import {
    getAgentAccess,
    resolveAgentProject,
    type AgentOptions,
} from './agentAccess';

const hasExpiry = (
    access: AiAccessForUser,
): access is AiAccessForUser & { expiresAt: string } =>
    'expiresAt' in access &&
    typeof access.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(access.expiresAt));

export const agentStatusHandler = async (
    options: AgentOptions,
): Promise<void> => {
    GlobalState.setVerbose(options.verbose);
    const access = await getAgentAccess(
        await resolveAgentProject(options.project),
    );
    if (access.refusal === null && access.identity === 'connected_person') {
        console.error(
            `Agent connected${hasExpiry(access) ? `, expires ${new Date(access.expiresAt).toISOString()}` : ''}`,
        );
        return;
    }
    if (access.requirementSource === null) {
        console.error('Agent connection not required for this project');
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
