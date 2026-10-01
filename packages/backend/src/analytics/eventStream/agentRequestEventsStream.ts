import type {
    AiAgentPromptCreatedEvent,
    AiAgentRequestLifecycleEvent,
} from '../LightdashAnalytics';
import { buildEnvelope, type ProjectionResult } from './projection';
import type { CompactedStreamColumn } from './types';

export const agentRequestEventsColumns: CompactedStreamColumn[] = [
    { name: 'event_name', type: 'VARCHAR' },
    { name: 'org_id', type: 'VARCHAR' },
    { name: 'user_id', type: 'VARCHAR' },
    { name: 'event_ts', type: 'TIMESTAMP' },
    { name: 'schema_version', type: 'INTEGER' },
    { name: 'event_id', type: 'VARCHAR' },
    { name: 'project_id', type: 'VARCHAR' },
    { name: 'agent_id', type: 'VARCHAR' },
    { name: 'thread_id', type: 'VARCHAR' },
    { name: 'prompt_id', type: 'VARCHAR' },
    { name: 'stage', type: 'VARCHAR' },
    { name: 'outcome', type: 'VARCHAR' },
    { name: 'surface', type: 'VARCHAR' },
    { name: 'human_score', type: 'INTEGER' },
];

const projectCreated = (
    payload: AiAgentPromptCreatedEvent,
): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId || !properties.promptId) return null;
    return {
        stream: 'agent_request_events',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            event_id: `created:${properties.promptId}`,
            project_id: properties.projectId,
            agent_id: properties.aiAgentId,
            thread_id: properties.threadId ?? null,
            prompt_id: properties.promptId,
            stage: 'created',
            outcome: null,
            surface: properties.context,
            human_score: null,
        },
    };
};

const projectLifecycle = (
    payload: AiAgentRequestLifecycleEvent,
): ProjectionResult => {
    const { properties } = payload;
    if (!properties.organizationId || !properties.promptId) return null;
    return {
        stream: 'agent_request_events',
        row: {
            ...buildEnvelope(payload, properties.organizationId),
            event_id: properties.eventId,
            project_id: properties.projectId,
            agent_id: properties.aiAgentId,
            thread_id: properties.threadId,
            prompt_id: properties.promptId,
            stage: payload.event.slice('ai_agent_request.'.length),
            outcome: properties.outcome ?? null,
            surface: null,
            human_score: properties.humanScore ?? null,
        },
    };
};

export const agentRequestEventsProjections = {
    'ai_agent_prompt.created': projectCreated,
    'ai_agent_request.outcome': projectLifecycle,
    'ai_agent_request.retry_started': projectLifecycle,
    'ai_agent_request.clarification_requested': projectLifecycle,
    'ai_agent_request.interrupted': projectLifecycle,
    'ai_agent_request.feedback_updated': projectLifecycle,
};
