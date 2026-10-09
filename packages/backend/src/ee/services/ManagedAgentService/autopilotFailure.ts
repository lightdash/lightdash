import * as Sentry from '@sentry/node';
import { APICallError } from 'ai';
import type { AiKeyManagement } from '../../../analytics/aiUsage';
import { scrubSecrets } from '../../../logging/scrubSecrets';

export { scrubSecrets } from '../../../logging/scrubSecrets';

export type AutopilotFailureStage = 'run' | 'timeout' | 'session' | 'report';

export type AutopilotFailureContext = {
    stage: AutopilotFailureStage;
    organizationUuid: string;
    projectUuid: string;
    runUuid: string;
    attribution: {
        provider: string | null;
        model: string | null;
        keyManagement: AiKeyManagement | null;
    } | null;
};

// A run stopped by Autopilot itself (timeout, step cap, finish reason).
export class AutopilotRunError extends Error {
    constructor(name: string, message: string) {
        super(message);
        this.name = name;
    }
}

const tag = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? 'unknown' : String(value);

// Reports a fresh error carrying only the scrubbed message and class name, so
// SDK errors never ship their request or response bodies.
export const captureAutopilotFailure = (
    error: unknown,
    context: AutopilotFailureContext,
): void => {
    const name = error instanceof Error ? error.name : 'Error';
    const message = scrubSecrets(
        error instanceof Error ? error.message : String(error),
    );
    const reported = new AutopilotRunError(name, message);
    const provider = context.attribution?.provider ?? null;
    Sentry.withScope((scope) => {
        scope.setTags({
            'autopilot.stage': context.stage,
            'autopilot.runUuid': context.runUuid,
            'ai.provider': tag(provider),
            'ai.model': tag(context.attribution?.model),
            'ai.keyManagement': tag(context.attribution?.keyManagement),
            organizationUuid: context.organizationUuid,
            projectUuid: context.projectUuid,
        });
        if (APICallError.isInstance(error)) {
            scope.setTags({
                'ai.statusCode': tag(error.statusCode),
                'ai.retryable': String(error.isRetryable),
            });
        }
        scope.setFingerprint(['autopilot', context.stage, tag(provider), name]);
        Sentry.captureException(reported);
    });
};
