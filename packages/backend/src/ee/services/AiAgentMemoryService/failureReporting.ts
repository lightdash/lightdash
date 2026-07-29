import { assertUnreachable } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { AISDKError } from 'ai';

/** Groups memory pipeline drops apart from the generic scheduler bucket. */
const AI_AGENT_MEMORY_FINGERPRINT = 'ai_agent_memory';

/** AI SDK messages quote the raw model output, so they are never reported. */
const WITHHELD_AI_SDK_MESSAGE = 'AI SDK error (message withheld)';

type AiAgentMemoryFailureBase = {
    error: unknown;
    /** The job-level signal, so an aborted job is not reported twice. */
    abortSignal: AbortSignal | null;
    organizationUuid: string;
    projectUuid: string;
};

export type AiAgentMemoryFailure = AiAgentMemoryFailureBase &
    (
        | { pipeline: 'distill'; threadUuid: string }
        | { pipeline: 'consolidate'; ownerUserUuid: string }
    );

const getFailureTags = (
    failure: AiAgentMemoryFailure,
): Record<string, string> => {
    const common = {
        'organization.uuid': failure.organizationUuid,
        'project.uuid': failure.projectUuid,
    };
    switch (failure.pipeline) {
        case 'distill':
            return {
                ...common,
                'ai_agent_memory.thread_uuid': failure.threadUuid,
            };
        case 'consolidate':
            return {
                ...common,
                'ai_agent_memory.owner_user_uuid': failure.ownerUserUuid,
            };
        default:
            return assertUnreachable(failure, 'Unknown memory pipeline');
    }
};

const getErrorName = (error: unknown): string =>
    error instanceof Error ? error.name : 'UnknownError';

/**
 * Only an aborted job is silent: the job timeout already reports where it
 * fires, and a partition it never reached records nothing. A call-level
 * timeout is a real drop nothing else reports, so it is not suppressed here.
 */
const isAbortFailure = (failure: AiAgentMemoryFailure): boolean =>
    failure.abortSignal?.aborted === true;

const getStackFrames = (error: Error): string =>
    (error.stack ?? '')
        .split('\n')
        .filter((line) => line.trimStart().startsWith('at '))
        .join('\n');

/**
 * Sentry's linked-errors integration walks `cause`, and the AI SDK hangs the
 * raw model output off it — memory bodies, terms and objects. Report a clone
 * carrying the name, a content-free message and the original frames only.
 */
const toReportableError = (error: unknown): unknown => {
    if (!(error instanceof Error)) return error;
    const message = AISDKError.isInstance(error)
        ? WITHHELD_AI_SDK_MESSAGE
        : error.message;
    const reportable = new Error(message);
    reportable.name = error.name;
    reportable.stack = [`${error.name}: ${message}`, getStackFrames(error)]
        .filter((part) => part.length > 0)
        .join('\n');
    return reportable;
};

/**
 * Both memory pipelines drop their failures by design — a failed job would
 * retry the LLM call — so the failure is reported explicitly here instead. Only
 * identifiers are attached: no memory, thread, term or object content.
 */
export const reportAiAgentMemoryFailure = (
    failure: AiAgentMemoryFailure,
): void => {
    try {
        if (isAbortFailure(failure)) return;
        Sentry.withScope((scope) => {
            scope.setFingerprint([
                AI_AGENT_MEMORY_FINGERPRINT,
                failure.pipeline,
                getErrorName(failure.error),
            ]);
            scope.setTags(getFailureTags(failure));
            Sentry.captureException(toReportableError(failure.error));
        });
    } catch {
        // Reporting must never affect the ledger, the run history, or what the
        // pass applied.
    }
};
