import { SEED_PROJECT } from '@lightdash/common';
import { z } from 'zod';
import type { LightdashApi } from './api';
import { markUndone, recordUndo, type Undo } from './cleanupLedger';
import type { AgentSpec } from './fixtureData';

export const projectUuid = SEED_PROJECT.project_uuid;

export const agentsPath = `/api/v1/projects/${projectUuid}/aiAgents`;

export const agentSchema = z.object({
    uuid: z.string(),
    name: z.string(),
    projectUuid: z.string(),
    instruction: z.string().nullable(),
    enableDataAccess: z.boolean(),
    enableSqlMode: z.boolean(),
    enableContentTools: z.boolean(),
    enableSelfImprovement: z.boolean(),
});

export type Agent = z.output<typeof agentSchema>;

export const agentPath = (agent: Agent) => `${agentsPath}/${agent.uuid}`;

/**
 * Data access and SQL mode on, content tools as the spec says (off for plan
 * F1), no model config: the agent runs on whatever the operator configured.
 */
export const createAgent = (api: LightdashApi, spec: AgentSpec) =>
    api.post(
        agentsPath,
        {
            projectUuid,
            name: spec.name,
            description: spec.description,
            instruction: spec.instruction,
            imageUrl: null,
            tags: null,
            integrations: [],
            groupAccess: [],
            userAccess: [],
            spaceAccess: [],
            enableDataAccess: true,
            enableSqlMode: true,
            enableContentTools: spec.enableContentTools,
            enableSelfImprovement: spec.enableSelfImprovement,
            version: 2,
        },
        agentSchema,
    );

// Cascades the agent's threads, prompts, artifacts and tool calls.
export const deleteAgent = (api: LightdashApi, agent: Agent) =>
    api.delete(`${agentsPath}/${agent.uuid}`);

// Creates an agent whose deletion is recorded in the cleanup ledger, so a
// killed run's agents are swept by the next run.
export const createTrackedAgent = async (
    api: LightdashApi,
    spec: AgentSpec,
) => {
    const agent = await createAgent(api, spec);
    const undo = recordUndo({
        kind: 'http',
        method: 'DELETE',
        path: agentPath(agent),
    });
    return {
        agent,
        remove: async () => {
            await deleteAgent(api, agent);
            markUndone(undo);
        },
    };
};

const preferencesPath = `${agentsPath}/preferences`;

/**
 * Runs `fn` with `agent` as the user's default agent (null: no default),
 * which decides what the Launcher and the home search box open with, then
 * restores the user's own preference.
 */
export const withAgentPreference = async <T>(
    api: LightdashApi,
    agent: Agent | null,
    fn: () => Promise<T>,
): Promise<T> => {
    const previous = await api.get(
        preferencesPath,
        z.object({ defaultAgentUuid: z.string() }).optional(),
    );
    if (agent === null && previous === undefined) return fn();
    const restore: Undo =
        previous === undefined
            ? { kind: 'http', method: 'DELETE', path: preferencesPath }
            : {
                  kind: 'http',
                  method: 'POST',
                  path: preferencesPath,
                  body: previous,
              };
    const undo = recordUndo(restore);
    if (agent === null) await api.delete(preferencesPath);
    else {
        await api.post(
            preferencesPath,
            { defaultAgentUuid: agent.uuid },
            z.unknown(),
        );
    }
    try {
        return await fn();
    } finally {
        if (previous === undefined) await api.delete(preferencesPath);
        else await api.post(preferencesPath, previous, z.unknown());
        markUndone(undo);
    }
};
