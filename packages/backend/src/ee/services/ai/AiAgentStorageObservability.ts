import * as Sentry from '@sentry/node';

export const AI_AGENT_STORAGE_SENTRY_MODULE = 'ai_agent_storage';

export const instrumentAiAgentStorage = <T extends object>(target: T): T =>
    new Proxy(target, {
        get(targetObject, property, receiver) {
            const value = Reflect.get(targetObject, property, receiver);
            if (typeof value !== 'function') return value;

            return (...args: unknown[]) =>
                Sentry.withIsolationScope((scope) => {
                    scope.setTag('module', AI_AGENT_STORAGE_SENTRY_MODULE);
                    return Reflect.apply(value, targetObject, args);
                });
        },
    });
