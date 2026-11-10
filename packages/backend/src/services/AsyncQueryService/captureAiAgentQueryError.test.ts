import {
    QueryExecutionContext,
    WarehouseConnectionError,
    WarehouseQueryError,
    type RunQueryTags,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { runWithAiAgentLogContext } from '../../logging/aiAgentLogContext';
import { markAlreadyReported } from '../../sentry/aiAgentErrors';
import { captureAiAgentQueryError } from './captureAiAgentQueryError';
import { PythonExecutionError } from './python/PythonSandboxRunner';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));
const captureException = vi.mocked(Sentry.captureException);

const turn = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
    toolCallId: 'call-1',
    toolName: 'runComposerQueries',
    model: 'claude-sonnet-5-5',
    serverVersion: '1.2.3',
    threadUrl: 'http://localhost/thread',
};

const aiQueryTags: RunQueryTags = {
    query_context: QueryExecutionContext.AI,
    agent_uuid: 'tag-agent-uuid',
    organization_uuid: 'tag-org-uuid',
    project_uuid: 'tag-project-uuid',
};

const capture = (error: unknown, queryTags: RunQueryTags = aiQueryTags) =>
    captureAiAgentQueryError({ error, queryTags, querySource: 'duckdb' });

describe('captureAiAgentQueryError', () => {
    beforeEach(() => captureException.mockClear());

    it('reports an agent query error as a warning tagged with its turn', () => {
        const error = new WarehouseQueryError('Binder Error');
        runWithAiAgentLogContext(turn, () => capture(error));
        expect(captureException).toHaveBeenCalledExactlyOnceWith(error, {
            level: 'warning',
            tags: expect.objectContaining({
                aiAgent: 'true',
                tool: 'runComposerQueries',
                threadUuid: 'thread-uuid',
                agentUuid: 'agent-uuid',
                querySource: 'duckdb',
            }),
            contexts: {
                aiAgent: expect.objectContaining({
                    threadUrl: 'http://localhost/thread',
                    projectUuid: 'project-uuid',
                }),
            },
        });
    });

    it('falls back to the query tags outside the agent turn, as on a NATS worker', () => {
        const error = new PythonExecutionError('not a DataFrame');
        capture(error);
        expect(captureException).toHaveBeenCalledExactlyOnceWith(error, {
            level: 'warning',
            tags: {
                aiAgent: 'true',
                agentUuid: 'tag-agent-uuid',
                organizationUuid: 'tag-org-uuid',
                querySource: 'duckdb',
            },
            contexts: { aiAgent: { projectUuid: 'tag-project-uuid' } },
        });
    });

    it('leaves infra and unexpected errors to their existing reporting', () => {
        capture(new WarehouseConnectionError('unreachable'));
        capture(new TypeError('boom'));
        expect(captureException).not.toHaveBeenCalled();
    });

    it('skips an error already reported elsewhere', () => {
        capture(markAlreadyReported(new WarehouseQueryError('upstream')));
        expect(captureException).not.toHaveBeenCalled();
    });

    it('leaves non-agent query errors out of Sentry', () => {
        capture(new WarehouseQueryError('bad'), {
            query_context: QueryExecutionContext.DASHBOARD,
        });
        expect(captureException).not.toHaveBeenCalled();
    });
});
