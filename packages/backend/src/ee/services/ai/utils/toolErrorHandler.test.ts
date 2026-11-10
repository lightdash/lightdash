import {
    AgentCapability,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    ForbiddenError,
    MissingWarehouseCredentialsError,
    NotFoundError,
    PersonSignInProvider,
    SnowflakeTokenError,
    toolErrorStructuredContentSchema,
    toolRunSqlOutputSchema,
    UnexpectedServerError,
    WarehouseConnectionError,
    WarehouseQueryError,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { InvalidToolInputError } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Logger from '../../../../logging/logger';
import { validateSelectOnly } from '../tools/runSql';
import {
    isAgentRecoverableError,
    toolErrorHandler,
    toolErrorOutput,
} from './toolErrorHandler';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const captureException = Sentry.captureException as import('vitest').Mock;

describe('isAgentRecoverableError', () => {
    it('treats 4xx LightdashErrors as the agent’s own mistake', () => {
        expect(
            isAgentRecoverableError(new WarehouseQueryError('bad sql')),
        ).toBe(true);
        expect(isAgentRecoverableError(new NotFoundError('no chart'))).toBe(
            true,
        );
        expect(isAgentRecoverableError(new ForbiddenError())).toBe(true);
    });

    it('treats 5xx LightdashErrors and non-Lightdash errors as incidents', () => {
        expect(isAgentRecoverableError(new UnexpectedServerError('boom'))).toBe(
            false,
        );
        expect(isAgentRecoverableError(new Error('plain'))).toBe(false);
        expect(isAgentRecoverableError('string')).toBe(false);
    });

    it('treats infrastructure failures as incidents even though they are 4xx', () => {
        expect(
            isAgentRecoverableError(new WarehouseConnectionError('down')),
        ).toBe(false);
        expect(
            isAgentRecoverableError(
                new MissingWarehouseCredentialsError('no credentials'),
            ),
        ).toBe(false);
    });
});

describe('toolErrorHandler', () => {
    beforeEach(() => {
        captureException.mockClear();
    });

    it('hands the error back to the model as a retryable message', () => {
        const result = toolErrorHandler(
            new WarehouseQueryError('Conversion Error: bad cast'),
            'Error running SQL query.',
        );

        expect(result).toContain('Error running SQL query.');
        expect(result).toContain('Conversion Error: bad cast');
        expect(result).toContain('Try again');
    });

    it('does not page Sentry for an error the model can recover from', () => {
        toolErrorHandler(
            new WarehouseQueryError('Conversion Error: bad cast'),
            'Error running SQL query.',
        );

        expect(captureException).not.toHaveBeenCalled();
    });

    it('pages Sentry for an incident', () => {
        const error = new WarehouseConnectionError('warehouse unreachable');

        toolErrorHandler(error, 'Error running query.');

        expect(captureException).toHaveBeenCalledWith(error);
    });

    it('lets a tool override the classification explicitly', () => {
        const recoverable = new NotFoundError('no chart');
        toolErrorHandler(recoverable, 'Error.', { captureToSentry: true });
        expect(captureException).toHaveBeenCalledWith(recoverable);

        captureException.mockClear();
        const incident = new Error('plain');
        toolErrorHandler(incident, 'Error.', { captureToSentry: false });
        expect(captureException).not.toHaveBeenCalled();
    });
});

describe('toolErrorOutput', () => {
    it('returns only the refusal message and its structured refusal', () => {
        const error = new AiAccessRefusedError(
            AiAccessRefusalReason.NEEDS_SIGN_IN,
        );
        const output = toolErrorOutput(error, 'Error running query.');
        expect(output.result).toBe(
            'Connect your agent to the warehouse once so it can run as you.',
        );
        expect(output.structuredContent).toEqual({
            error: error.message,
            refusal: error.refusal,
        });
        expect(output.metadata).toEqual({
            status: 'error',
            toolError: { code: 'access_refused', pythonExceptionType: null },
        });
    });
    it('mirrors the model-facing text as structured content', () => {
        const output = toolErrorOutput(
            new WarehouseQueryError('bad sql'),
            'Error running SQL query.',
        );

        expect(output.metadata).toEqual({
            status: 'error',
            toolError: { code: 'warehouse_other', pythonExceptionType: null },
        });
        expect(output.structuredContent).toStrictEqual({
            error: output.result,
        });
        expect(output.result).toContain('bad sql');
        expect(
            toolErrorStructuredContentSchema.safeParse(output.structuredContent)
                .success,
        ).toBe(true);
    });
});

test('policy refusal tells the model not to retry and preserves typed data', () => {
    const error = new AiAccessRefusedError(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
        { settingsUrl: '/generalSettings/agentIdentity' },
    );
    const output = toolErrorOutput(error, 'Error running tool.');
    expect(output.result).toContain('Do not retry');
    expect(output.result).not.toContain('Try again');
    expect(output.structuredContent.refusal).toEqual(error.refusal);
});

test('retains policy refusal in the metadata stored by the agent', () => {
    const error = new AiAccessRefusedError(
        AiAccessRefusalReason.AGENT_CAPABILITY_DENIED,
    );
    const output = toolErrorOutput(error, 'Access refused');
    expect(output.metadata).toMatchObject({ refusal: error.refusal });
    // toolError is telemetry the output schema leaves out
    const { toolError, ...metadata } = output.metadata;
    expect(toolError).toEqual({
        code: 'access_refused',
        pythonExceptionType: null,
    });
    expect(toolRunSqlOutputSchema.parse(output)).toEqual({
        ...output,
        metadata,
    });
    expect(
        toolErrorStructuredContentSchema.parse(output.structuredContent),
    ).toEqual(output.structuredContent);
});

test('appends plain additional requirements and See why without changing the first line', () => {
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
    const output = toolErrorOutput(error, 'Error running tool.');
    expect(output.result.split('\n')[0]).toBe(error.message);
    expect(output.result).toContain(
        'Also needed: Publish and share\nSee why: /generalSettings/myAgentConnections',
    );
    expect(output.result).toContain('Do not retry');
    expect(output.structuredContent).toEqual({
        error: output.result,
        refusal: error.refusal,
    });
});

test('preserves personal Snowflake reauthentication through tool metadata parsing', () => {
    vi.mocked(Logger.error).mockClear();
    vi.mocked(Logger.warn).mockClear();
    const output = toolErrorOutput(
        new SnowflakeTokenError('Error refreshing snowflake token', {
            requiresUserReauthentication: true,
        }),
        'Error running query.',
    );
    expect(output.metadata).toMatchObject({
        requiresSnowflakeReauthentication: true,
    });
    expect(toolRunSqlOutputSchema.parse(output).metadata).toMatchObject({
        requiresSnowflakeReauthentication: true,
    });
    expect(output.result).toContain('Your Snowflake sign-in has expired');
    expect(output.result).not.toContain('Try again');
    expect(Logger.warn).toHaveBeenCalledWith(
        '[AiAgent][Tool Error Handler] Personal Snowflake sign-in requires reauthentication',
    );
    expect(Logger.error).not.toHaveBeenCalled();
});

test('does not offer personal reauthentication for an expired shared project sign-in', () => {
    const error = new SnowflakeTokenError('Ask a project admin to reconnect.', {
        sharedSignIn: {
            projectUuid: 'project',
            provider: PersonSignInProvider.SNOWFLAKE,
            subjectUserUuid: null,
            subjectName: null,
            subjectBasis: null,
        },
    });
    const output = toolErrorOutput(error, 'Error running query.');
    expect(output.metadata).toEqual({
        status: 'error',
        toolError: { code: 'unknown', pythonExceptionType: null },
    });
    expect(output.result).toContain(error.message);
    expect(output.result).not.toContain('your own Snowflake account');
});

test('keeps unattributed Snowflake token errors unchanged', () => {
    const output = toolErrorOutput(
        new SnowflakeTokenError('Expired token'),
        'Error running query.',
    );
    expect(output.metadata).toEqual({
        status: 'error',
        toolError: { code: 'unknown', pythonExceptionType: null },
    });
    expect(output.result).toContain('Expired token');
    expect(output.result).not.toContain('your own Snowflake account');
});

test('codes rejected agent SQL as sql_not_select', () => {
    const error = (() => {
        try {
            validateSelectOnly('DELETE FROM orders');
        } catch (e) {
            return e;
        }
        throw new Error('Expected validation to fail');
    })();
    expect(toolErrorOutput(error, 'Error running SQL query.').metadata).toEqual(
        {
            status: 'error',
            toolError: { code: 'sql_not_select', pythonExceptionType: null },
        },
    );
});

test('codes tool input the SDK rejected as invalid_input', () => {
    const error = new InvalidToolInputError({
        toolName: 'runSql',
        toolInput: '{}',
        cause: new Error('sql is required'),
    });
    expect(toolErrorOutput(error, 'Invalid input.').metadata).toMatchObject({
        toolError: { code: 'invalid_input', pythonExceptionType: null },
    });
});
