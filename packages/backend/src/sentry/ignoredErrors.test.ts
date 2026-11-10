import {
    eventFiltersIntegration,
    type ErrorEvent,
    type NodeClient,
} from '@sentry/node';
import {
    AI_AGENT_SENTRY_TAG,
    dropIgnoredErrors,
    IGNORE_ERRORS,
} from './ignoredErrors';

const client = { getOptions: () => ({}) } as unknown as NodeClient;
const sentryFilter = (options: { ignoreErrors?: string[] }) => {
    const integration = eventFiltersIntegration(options);
    return (event: ErrorEvent) =>
        integration.processEvent!(event, {}, client) !== null;
};
// Before: Sentry.init({ ignoreErrors }). After: default filters, then beforeSend.
const keptBefore = sentryFilter({ ignoreErrors: IGNORE_ERRORS });
const keptByDefaults = sentryFilter({});
const keptAfter = (event: ErrorEvent) =>
    keptByDefaults(event) && dropIgnoredErrors(event) !== null;

const exception = (
    ...values: { type?: string; value?: string }[]
): ErrorEvent => ({ type: undefined, exception: { values } });

const nonAgentEvents: Record<string, ErrorEvent> = {
    'listed type': exception({ type: 'WarehouseQueryError', value: 'bad' }),
    'type name inside a longer type': exception({
        type: 'SnowflakeTokenError',
        value: 'expired',
    }),
    'listed name in the value only': exception({
        type: 'Error',
        value: 'ForbiddenError: no access',
    }),
    'listed name in the message': {
        type: undefined,
        message: 'NotFoundError while loading chart',
    },
    'listed type with an empty value': exception({
        type: 'WarehouseQueryError',
        value: '',
    }),
    'listed name only in the cause': exception(
        { type: 'WarehouseQueryError', value: 'root' },
        { type: 'Error', value: 'wrapped' },
    ),
    'unlisted error': exception({ type: 'TypeError', value: 'x is undefined' }),
    'agent-tagged error-level event': {
        ...exception({ type: 'WarehouseQueryError', value: 'bad' }),
        level: 'error',
        tags: { [AI_AGENT_SENTRY_TAG]: 'true' },
    },
};

describe('dropIgnoredErrors', () => {
    it.each(Object.entries(nonAgentEvents))(
        'filters %s exactly as ignoreErrors did',
        (_, event) => {
            expect(keptAfter(event)).toBe(keptBefore(event));
        },
    );

    it('keeps a listed error sent as an AI agent warning', () => {
        const event: ErrorEvent = {
            ...exception({ type: 'WarehouseQueryError', value: 'bad' }),
            level: 'warning',
            tags: { [AI_AGENT_SENTRY_TAG]: 'true' },
        };
        expect(keptBefore(event)).toBe(false);
        expect(keptAfter(event)).toBe(true);
    });
});
