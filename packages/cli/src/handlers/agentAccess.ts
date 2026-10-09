import { ParameterError, type AiAccessForUser } from '@lightdash/common';
import { getConfig } from '../config';
import { lightdashApi } from './dbt/apiClient';
import { resolveProjectFlag } from './resolveProjectFlag';

export type AgentOptions = {
    project?: string;
    verbose: boolean;
};

export const resolveAgentProject = async (
    project?: string,
): Promise<string> => {
    if (project !== undefined) return resolveProjectFlag(project);
    const config = await getConfig();
    if (!config.context?.project) {
        throw new ParameterError(
            'No project selected. Run `lightdash config set-project` or pass --project <uuid or slug>.',
        );
    }
    return config.context.project;
};

export const getAgentAccess = (
    projectUuid: string,
    signal: AbortSignal | null = null,
): Promise<AiAccessForUser> =>
    lightdashApi<AiAccessForUser>({
        method: 'GET',
        url: `/api/v2/projects/${projectUuid}/ai-access/me`,
        body: undefined,
        ...(signal ? { signal } : {}),
    });
