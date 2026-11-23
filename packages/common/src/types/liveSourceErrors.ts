/**
 * Stable codes for every way a live data source query can fail. Alerts,
 * analytics and the agent group errors by them, so a published code never
 * changes meaning or name; messages can. Add codes, never rename them.
 */
export const LIVE_SOURCE_REFUSAL_CODES = [
    'live_source.refused.table_calculation',
    'live_source.refused.custom_metric',
    'live_source.refused.custom_dimension',
    'live_source.refused.period_over_period',
    'live_source.refused.pivot',
    'live_source.refused.date_zoom',
    'live_source.refused.unknown_field',
    'live_source.refused.filter_operator',
    'live_source.refused.metric_filter',
    'live_source.refused.multiple_values',
    'live_source.refused.or_group',
    'live_source.refused.nested_group',
    'live_source.refused.date_operator',
    'live_source.refused.date_range',
    'live_source.refused.field_combination',
    'live_source.refused.too_many_fields',
    'live_source.refused.timezone',
    'live_source.refused.row_limit',
    'live_source.refused.call_budget',
    'live_source.refused.sort',
    'live_source.refused.date_grain',
    'live_source.refused.sign_in_required',
] as const;

/** Lightdash refused the query before calling the API: the source can't run it. */
export type LiveSourceRefusalCode = (typeof LIVE_SOURCE_REFUSAL_CODES)[number];

export const LIVE_SOURCE_UPSTREAM_ERROR_CODES = [
    'live_source.upstream.auth',
    'live_source.upstream.rate_limited',
    'live_source.upstream.invalid_request',
    'live_source.upstream.timeout',
    'live_source.upstream.unknown',
] as const;

/** The API was called and failed. */
export type LiveSourceUpstreamErrorCode =
    (typeof LIVE_SOURCE_UPSTREAM_ERROR_CODES)[number];

export const LIVE_SOURCE_INTERNAL_ERROR_CODES = [
    'live_source.internal.invalid_request',
    'live_source.internal.error',
    'live_source.internal.concurrency_limit',
] as const;

/**
 * Lightdash failed: our own validation rejected the request, something broke,
 * or the source hit our own limit on queries running at once.
 */
export type LiveSourceInternalErrorCode =
    (typeof LIVE_SOURCE_INTERNAL_ERROR_CODES)[number];

export type LiveSourceErrorCode =
    | LiveSourceRefusalCode
    | LiveSourceInternalErrorCode
    | LiveSourceUpstreamErrorCode;

/**
 * Who a failed live data source query is on: Lightdash declined it
 * (`refused`), Lightdash failed (`internal`), or the integration was called
 * and failed (`integration`).
 */
export type LiveSourceErrorOrigin = 'refused' | 'internal' | 'integration';

export const getLiveSourceErrorOrigin = (
    code: LiveSourceErrorCode,
): LiveSourceErrorOrigin => {
    if (code.startsWith('live_source.refused.')) return 'refused';
    if (code.startsWith('live_source.internal.')) return 'internal';
    return 'integration';
};

/**
 * A source that queries as each viewer, which this viewer has no usable
 * sign-in for: never signed in, or their sign-in expired or was revoked.
 */
export type LiveSourceSignInRequired = {
    externalConnectionUuid: string;
    /** The source's name, for "Connect your <name> account". */
    name: string;
    /** The integration's label, such as Salesforce. */
    integration: string;
    reason: 'missing' | 'expired';
    /** Opens the integration's sign-in in a browser; returns to the app after. */
    connectUrl: string;
};

/** What a live data source error carries in `LightdashError.data`. */
export type LiveSourceErrorData = {
    liveSourceErrorCode: LiveSourceErrorCode;
    /** Every distinct code when one query was refused for several reasons. */
    liveSourceErrorCodes: LiveSourceErrorCode[];
    /** Set with `live_source.refused.sign_in_required`. */
    signIn?: LiveSourceSignInRequired;
};

export const isLiveSourceSignInRequired = (
    data: unknown,
): data is LiveSourceErrorData & { signIn: LiveSourceSignInRequired } =>
    typeof data === 'object' &&
    data !== null &&
    'liveSourceErrorCode' in data &&
    data.liveSourceErrorCode === 'live_source.refused.sign_in_required' &&
    'signIn' in data &&
    typeof data.signIn === 'object' &&
    data.signIn !== null;

/** What a person reads when a source needs their own sign-in. */
export const getLiveSourceSignInSentence = ({
    name,
    integration,
    reason,
}: Pick<LiveSourceSignInRequired, 'name' | 'integration' | 'reason'>) =>
    reason === 'expired'
        ? `Your sign-in to ${name} expired or was revoked. Connect your ${integration} account again to see this data.`
        : `${name} shows each person their own ${integration} data. Connect your ${integration} account to see it.`;

/** The error message: the sentence, then the link, for agents and MCP clients. */
export const getLiveSourceSignInRequiredMessage = (
    signIn: LiveSourceSignInRequired,
) =>
    `${getLiveSourceSignInSentence(signIn)} Connect it here: ${signIn.connectUrl}`;

const SIGN_IN_MESSAGE_PATTERNS: {
    reason: LiveSourceSignInRequired['reason'];
    pattern: RegExp;
}[] = [
    {
        reason: 'expired',
        pattern:
            /^Your sign-in to (.+) expired or was revoked\. Connect your (.+) account again to see this data\. Connect it here: (\S+)$/,
    },
    {
        reason: 'missing',
        pattern:
            /^(.+) shows each person their own (.+) data\. Connect your .+ account to see it\. Connect it here: (\S+)$/,
    },
];

// Only a source's uuid is read from the link; the app builds its own from it
const CONNECT_PATH_PATTERN =
    /\/live-sources\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/user-sign-in\/start$/i;

/**
 * Reads a sign-in prompt back from a stored error message: a query that
 * lost its sign-in while running keeps only its message.
 */
export const parseLiveSourceSignInRequiredMessage = (
    message: string,
): LiveSourceSignInRequired | null => {
    for (const { reason, pattern } of SIGN_IN_MESSAGE_PATTERNS) {
        const match = pattern.exec(message);
        if (match) {
            const [, name, integration, connectUrl] = match;
            let pathname: string;
            try {
                pathname = new URL(connectUrl).pathname;
            } catch {
                return null;
            }
            const connection = CONNECT_PATH_PATTERN.exec(pathname);
            if (!connection) return null;
            return {
                externalConnectionUuid: connection[1],
                name,
                integration,
                reason,
                connectUrl,
            };
        }
    }
    return null;
};
