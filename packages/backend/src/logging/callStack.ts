import type { CallStackEntry } from './auditLog';

const SKIP_METHODS = new Set(['createAuditedAbility', 'constructor']);

/**
 * Captures the service call stack from the current stack trace.
 * Extracts up to `maxDepth` service method calls by looking for
 * class methods on classes ending in "Service".
 */
export const captureServiceCallStack = (
    maxDepth: number = 10,
): CallStackEntry[] => {
    const { stack } = new Error();
    if (!stack) return [];

    const entries: CallStackEntry[] = [];
    const lines = stack.split('\n');

    // eslint-disable-next-line no-restricted-syntax
    for (const line of lines) {
        if (entries.length >= maxDepth) break;

        // Match patterns like "at ClassName.methodName" where ClassName ends with Service
        const match = line.match(/at (\w*Service)\.(\w+)/);
        if (match && !SKIP_METHODS.has(match[2])) {
            entries.push({
                serviceName: match[1],
                methodName: match[2],
                depth: entries.length,
            });
        }
    }

    return entries;
};
