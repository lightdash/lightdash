import { Knex } from 'knex';
import { AgentCodingSessionStatus } from '@lightdash/common';

// Sessions table
export const AgentCodingSessionsTableName = 'agent_coding_sessions';

export type DbAgentCodingSession = {
    session_id: number;
    session_uuid: string;
    project_uuid: string;
    created_by_user_uuid: string;
    github_repo: string;
    github_branch: string;
    e2b_sandbox_id: string | null;
    claude_session_id: string | null;
    status: AgentCodingSessionStatus;
    error_message: string | null;
    created_at: Date;
    updated_at: Date;
};

type CreateDbAgentCodingSession = Pick<
    DbAgentCodingSession,
    'project_uuid' | 'created_by_user_uuid' | 'github_repo' | 'github_branch'
>;

type UpdateDbAgentCodingSession = Partial<
    Pick<
        DbAgentCodingSession,
        | 'e2b_sandbox_id'
        | 'claude_session_id'
        | 'status'
        | 'error_message'
        | 'updated_at'
    >
>;

export type AgentCodingSessionsTable = Knex.CompositeTableType<
    DbAgentCodingSession,
    CreateDbAgentCodingSession,
    UpdateDbAgentCodingSession
>;

// Messages table
export const AgentCodingSessionMessagesTableName =
    'agent_coding_session_messages';

export type DbAgentCodingSessionMessage = {
    message_id: number;
    message_uuid: string;
    session_uuid: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: Date;
};

type CreateDbAgentCodingSessionMessage = Pick<
    DbAgentCodingSessionMessage,
    'session_uuid' | 'role' | 'content'
>;

export type AgentCodingSessionMessagesTable = Knex.CompositeTableType<
    DbAgentCodingSessionMessage,
    CreateDbAgentCodingSessionMessage
>;

// Events table
export const AgentCodingSessionEventsTableName =
    'agent_coding_session_events';

export type DbAgentCodingSessionEvent = {
    event_id: number;
    session_uuid: string;
    event_type: string;
    payload: Record<string, unknown>;
    created_at: Date;
};

type CreateDbAgentCodingSessionEvent = Pick<
    DbAgentCodingSessionEvent,
    'session_uuid' | 'event_type' | 'payload'
>;

export type AgentCodingSessionEventsTable = Knex.CompositeTableType<
    DbAgentCodingSessionEvent,
    CreateDbAgentCodingSessionEvent
>;
