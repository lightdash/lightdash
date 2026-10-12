import { AgentConnectionApprovalRequestError } from '../../models/AgentConnectionApprovalRequestModel';
import {
    AgentConnectionApprovalError,
    serializeAgentConnectionApprovalError,
} from './AgentConnectionApprovalError';

it.each([
    ['authentication_required', 401],
    ['agent_identity_disabled', 403],
    ['person_required', 403],
    ['approval_forbidden', 403],
    ['csrf_failed', 403],
    ['invalid_approval_request', 422],
    ['too_many_projects', 422],
    ['pending_request_limit', 429],
    ['agent_connections_unavailable', 503],
    ['approval_request_not_found', 404],
    ['approval_request_expired', 410],
    ['approval_request_consumed', 409],
    ['approval_selection_changed', 409],
] as const)('serializes %s at the CLI error.code location', (code, status) => {
    expect(
        serializeAgentConnectionApprovalError(
            new AgentConnectionApprovalError(code),
        ),
    ).toEqual({
        status: 'error',
        error: {
            statusCode: status,
            name: 'AgentConnectionApprovalError',
            code,
            message: expect.any(String),
        },
    });
});

it('does not expose internal errors or credentials', () => {
    expect(
        serializeAgentConnectionApprovalError(
            new Error('pat-sentinel proxy-sentinel verifier-sentinel'),
        ),
    ).toEqual({
        status: 'error',
        error: {
            statusCode: 500,
            name: 'AgentConnectionApprovalError',
            code: 'internal_error',
            message: 'The approval request could not be processed.',
        },
    });
});

it('translates storage errors without changing their code', () => {
    expect(
        serializeAgentConnectionApprovalError(
            new AgentConnectionApprovalRequestError(
                'pending_request_limit',
                123,
            ),
        ),
    ).toMatchObject({
        error: { statusCode: 429, code: 'pending_request_limit' },
    });
});
