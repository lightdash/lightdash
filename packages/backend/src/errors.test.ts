import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    ExpectedNotFoundError,
    isExpectedError,
    NotFoundError,
} from '@lightdash/common';
import { errorHandler } from './errors';

describe('handled API error reporting', () => {
    it('preserves expected not-found errors without reporting them', () => {
        const error = new ExpectedNotFoundError('Optional resource not found');
        const errorResponse = errorHandler(error);

        expect(errorResponse).toBe(error);
        expect(isExpectedError(errorResponse)).toBe(true);
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error).toMatchObject({
            name: 'NotFoundError',
            statusCode: 404,
            data: {},
        });
        expect(Object.keys(error)).not.toContain('isExpected');
    });

    it('continues reporting ordinary not-found errors', () => {
        expect(
            isExpectedError(
                errorHandler(new NotFoundError('Required resource not found')),
            ),
        ).toBe(false);
    });

    it('requires expected errors to be Error instances', () => {
        expect(isExpectedError({ isExpected: true })).toBe(false);
    });
});

describe('agent identity refusal API response', () => {
    it.each([
        AiAccessRefusalReason.NEEDS_SIGN_IN,
        AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED,
    ])('preserves the typed %s refusal for the API error handler', (reason) => {
        const error = new AiAccessRefusedError(reason);
        const response = errorHandler(error);
        expect(response.statusCode).toBe(403);
        expect(response.data).toEqual(error.refusal);
        expect(response.message).toBe(error.refusal.message);
    });
});

it('serializes all optional diagnostic fields in the REST error data', () => {
    const error = new AiAccessRefusedError(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        {
            capability: AgentCapability.ContentWrite,
            policyLayer: 'org_ceiling',
            requiredCapabilities: [
                AgentCapability.ContentWrite,
                AgentCapability.Publish,
            ],
            blockersComplete: true,
            explanationUrl: '/generalSettings/myAgentConnections',
            blockers: [
                {
                    checkId: 'capability:content_write',
                    status: 'refused',
                    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    capability: AgentCapability.ContentWrite,
                    policyLayer: 'org_ceiling',
                    message: 'Primary',
                    settingsUrl: null,
                },
                {
                    checkId: 'capability:publish',
                    status: 'refused',
                    reason: AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
                    capability: AgentCapability.Publish,
                    policyLayer: 'org_ceiling',
                    message: 'Secondary',
                    settingsUrl: null,
                },
            ],
        },
    );
    const serialized = JSON.parse(JSON.stringify(errorHandler(error).data));
    expect(serialized).toEqual(error.refusal);
    expect(serialized).toMatchObject({
        requiredCapabilities: [
            AgentCapability.ContentWrite,
            AgentCapability.Publish,
        ],
        blockersComplete: true,
        explanationUrl: '/generalSettings/myAgentConnections',
        blockers: expect.arrayContaining([
            expect.objectContaining({ checkId: 'capability:publish' }),
        ]),
    });
});
