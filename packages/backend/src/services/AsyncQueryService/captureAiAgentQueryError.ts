import { QueryExecutionContext, type RunQueryTags } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    getAiAgentSentryContext,
    isAgentRecoverableError,
    isAlreadyReported,
} from '../../sentry/aiAgentErrors';
import { PythonExecutionError } from './python/PythonSandboxRunner';

/** The agent only sees a failed query's stored message, so its expected error goes to Sentry where it is thrown. */
export const captureAiAgentQueryError = ({
    error,
    queryTags,
    querySource,
}: {
    error: unknown;
    queryTags: RunQueryTags;
    querySource: 'warehouse' | 'duckdb' | 'python';
}) => {
    if (queryTags.query_context !== QueryExecutionContext.AI) return;
    if (isAlreadyReported(error)) return;
    // Infra and unexpected errors keep their existing reporting
    if (
        !isAgentRecoverableError(error) &&
        !(error instanceof PythonExecutionError)
    )
        return;
    const { tags, contexts } = getAiAgentSentryContext();
    // A NATS worker runs the query outside the agent turn, so only the query's own tags are known
    const queryIds = {
        ...(queryTags.agent_uuid ? { agentUuid: queryTags.agent_uuid } : {}),
        ...(queryTags.organization_uuid
            ? { organizationUuid: queryTags.organization_uuid }
            : {}),
    };
    Sentry.captureException(error, {
        level: 'warning',
        tags: { ...queryIds, ...tags, querySource },
        contexts: {
            aiAgent: { projectUuid: queryTags.project_uuid ?? null },
            ...contexts,
        },
    });
};
