import { ParameterError, type Project } from '@lightdash/common';
import { getConfig, type Config } from '../config';
import { resolveCredential } from '../credentials';
import { lightdashApi } from '../handlers/dbt/apiClient';

export const resolveAgentConnectionProject = async (
    value?: string,
): Promise<string> => {
    if (
        value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
        )
    )
        return value;
    const credential = await resolveCredential(
        await getConfig({ readOnly: true }),
    );
    if (credential.kind !== 'agent_connection')
        throw new Error('An agent connection credential is required.');
    const approved = credential.slot.lastReported.approvedProjects;
    if (value === undefined) {
        if (approved.length === 1) return approved[0].projectUuid;
        throw new ParameterError(
            'This agent connection needs an explicit project. Pass --project on a command that supports it, or select a connection with one approved project.',
        );
    }
    const matches = await approved.reduce<Promise<string[]>>(
        async (pending, { projectUuid }) => {
            const found = await pending;
            const project = await lightdashApi<Project>({
                method: 'GET',
                url: `/api/v1/projects/${projectUuid}`,
                body: undefined,
            });
            if (project.projectUuid !== projectUuid)
                throw new Error(
                    'The server returned a different project for this agent connection.',
                );
            return project.slug === value ? [...found, projectUuid] : found;
        },
        Promise.resolve([]),
    );
    if (matches.length !== 1)
        throw new ParameterError(
            'The project slug must match exactly one approved, accessible project for this agent connection. Pass --project with its UUID.',
        );
    return matches[0];
};

export const configWithAgentProject = async (
    config: Config,
): Promise<Config> => ({
    ...config,
    context: {
        ...config.context,
        project: await resolveAgentConnectionProject(),
        projectName: undefined,
        previewProject: undefined,
        previewName: undefined,
        source: undefined,
    },
});
