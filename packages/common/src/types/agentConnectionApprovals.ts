import { type AgentCapability } from './agentPermissions';
import { type UUID, type UuidOrSlug } from './api/uuid';

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
        review?: AgentConnectionApprovalReview;
    };
};

export type AgentConnectionApprovalCapability = {
    capability: AgentCapability;
    visibility: 'offered' | 'hidden' | 'blocked';
    reasonCode: string | null;
    reason: string | null;
};

export type AgentConnectionApprovalProject = {
    projectUuid: string;
    name: string;
    selectable: boolean;
    reason: string | null;
    capabilities: AgentConnectionApprovalCapability[];
};

export type AgentConnectionApprovalReview = {
    request: {
        name: string;
        clientLabel: string;
        expiresInSeconds: number;
        expiresAt: string;
    };
    notice: 'Review only. No connection will be created.';
    projects: AgentConnectionApprovalProject[];
    nonce: string;
    revision: number;
};

export type AgentConnectionApprovalReviewResponse = {
    status: 'ok';
    results: AgentConnectionApprovalReview;
};

export type AgentConnectionApprovalDecision = {
    decision: 'approve' | 'deny';
    revision: number;
    nonce: string;
    projectUuids: UUID[];
    capabilities: AgentCapability[];
};

export type AgentConnectionApprovalDecisionResponse = {
    status: 'ok';
    results: { completionUrl: string };
};
