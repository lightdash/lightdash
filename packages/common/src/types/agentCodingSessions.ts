export const AgentCodingSessionStatuses = [
    'pending',
    'running',
    'finished',
    'errored',
] as const;

export type AgentCodingSessionStatus =
    (typeof AgentCodingSessionStatuses)[number];

export interface AgentCodingSession {
    sessionUuid: string;
    projectUuid: string;
    createdByUserUuid: string;
    githubRepo: string;
    githubBranch: string;
    status: AgentCodingSessionStatus;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface AgentCodingSessionMessage {
    messageUuid: string;
    sessionUuid: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
}

export interface CreateAgentCodingSessionRequest {
    prompt: string;
    githubBranch: string;
}

export interface SendAgentCodingSessionMessageRequest {
    prompt: string;
}

// Base event type for type discrimination
interface BaseStreamEvent {
    sessionId?: string; // Claude session ID for resume
}

interface TokenStreamEvent extends BaseStreamEvent {
    type: 'token';
    text: string;
}

interface StatusStreamEvent extends BaseStreamEvent {
    type: 'status';
    status: AgentCodingSessionStatus;
}

interface ErrorStreamEvent extends BaseStreamEvent {
    type: 'error';
    error: string;
}

interface CompleteStreamEvent extends BaseStreamEvent {
    type: 'complete';
}

interface ToolStartStreamEvent extends BaseStreamEvent {
    type: 'tool_start';
    toolName: string;
    toolUseId: string;
}

interface ToolInputDeltaStreamEvent extends BaseStreamEvent {
    type: 'tool_input_delta';
    partialJson: string;
}

interface ToolEndStreamEvent extends BaseStreamEvent {
    type: 'tool_end';
}

export type AgentCodingStreamEvent =
    | TokenStreamEvent
    | StatusStreamEvent
    | ErrorStreamEvent
    | CompleteStreamEvent
    | ToolStartStreamEvent
    | ToolInputDeltaStreamEvent
    | ToolEndStreamEvent;

// Persisted event (stored in DB for event sourcing)
export interface AgentCodingSessionEvent {
    eventId: number;
    sessionUuid: string;
    event: AgentCodingStreamEvent;
    createdAt: Date;
}

// API response types
export type ApiAgentCodingSessionResponse = {
    status: 'ok';
    results: AgentCodingSession;
};

export type ApiAgentCodingSessionListResponse = {
    status: 'ok';
    results: AgentCodingSession[];
};

export type ApiAgentCodingSessionMessageResponse = {
    status: 'ok';
    results: AgentCodingSessionMessage;
};
