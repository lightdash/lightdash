import {
    type AgentConnectionApprovalErrorCode,
    type AgentConnectionApprovalErrorResponse,
} from '@lightdash/common';
import { type Response } from 'express';
import { AgentConnectionApprovalRequestError } from '../../models/AgentConnectionApprovalRequestModel';

const errors: Record<
    AgentConnectionApprovalErrorCode,
    { status: number; message: string }
> = {
    authentication_required: {
        status: 401,
        message: 'Personal authentication is required.',
    },
    agent_identity_disabled: {
        status: 403,
        message: 'Agent identity is disabled.',
    },
    person_required: {
        status: 403,
        message:
            'A person using a session or personal access token is required.',
    },
    approval_forbidden: {
        status: 403,
        message: 'Sign in with the account that started this request.',
    },
    csrf_failed: {
        status: 403,
        message: 'The request origin could not be verified.',
    },
    invalid_approval_request: {
        status: 422,
        message: 'Invalid approval request.',
    },
    too_many_projects: {
        status: 422,
        message: 'At most 500 projects can be requested.',
    },
    pending_request_limit: {
        status: 429,
        message: 'Too many pending approval requests.',
    },
    agent_connections_unavailable: {
        status: 503,
        message: 'Agent connections cannot be approved on this instance yet.',
    },
    approval_request_not_found: {
        status: 404,
        message: 'Approval request not found.',
    },
    approval_request_expired: {
        status: 410,
        message: 'Approval request has expired.',
    },
    approval_request_consumed: {
        status: 409,
        message: 'Approval request has already been used.',
    },
    approval_selection_changed: {
        status: 409,
        message: 'The available selection has changed.',
    },
    internal_error: {
        status: 500,
        message: 'The approval request could not be processed.',
    },
};

export class AgentConnectionApprovalError extends Error {
    constructor(readonly code: AgentConnectionApprovalErrorCode) {
        super(errors[code].message);
        this.name = 'AgentConnectionApprovalError';
    }
}

export const serializeAgentConnectionApprovalError = (
    error: unknown,
): AgentConnectionApprovalErrorResponse => {
    const code =
        error instanceof AgentConnectionApprovalError ||
        error instanceof AgentConnectionApprovalRequestError
            ? error.code
            : 'internal_error';
    return {
        status: 'error',
        error: {
            statusCode: errors[code].status,
            name: 'AgentConnectionApprovalError',
            code,
            message: errors[code].message,
        },
    };
};

export const sendAgentConnectionApprovalError = (
    res: Response,
    error: unknown,
) => {
    const payload = serializeAgentConnectionApprovalError(error);
    res.set('Cache-Control', 'no-store');
    if (
        error instanceof AgentConnectionApprovalRequestError &&
        error.retryAfterSeconds !== null
    )
        res.set('Retry-After', String(error.retryAfterSeconds));
    return res.status(payload.error.statusCode).json(payload);
};
