import { type AgentCapability } from './agentPermissions';
import { type UuidOrSlug } from './api/uuid';

export type AgentConnectionApprovalRequest = {
    clientId: 'lightdash-cli';
    name: string;
    projects: UuidOrSlug[] | null;
    capabilities: AgentCapability[];
    expiresInSeconds: number;
    redirectUri: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
    resource: string;
};

export type AgentConnectionApprovalResponse = {
    status: 'ok';
    results: {
        authorizationUrl: string;
        issuer: string;
        resource: string;
        expiresAt: string;
    };
};

export type AgentConnectionApprovalErrorCode =
    | 'authentication_required'
    | 'agent_identity_disabled'
    | 'person_required'
    | 'approval_forbidden'
    | 'csrf_failed'
    | 'invalid_approval_request'
    | 'too_many_projects'
    | 'pending_request_limit'
    | 'agent_connections_unavailable'
    | 'approval_request_not_found'
    | 'approval_request_expired'
    | 'approval_request_consumed'
    | 'approval_selection_changed'
    | 'internal_error';

export type AgentConnectionApprovalErrorResponse = {
    status: 'error';
    error: {
        statusCode: number;
        name: 'AgentConnectionApprovalError';
        code: AgentConnectionApprovalErrorCode;
        message: string;
    };
};
