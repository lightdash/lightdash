import { isComposerQueriesEnabled } from './composerQueriesGate';

const optedIn = {
    multiSourceQueryEnabled: true,
    composeSqlRunnerEnabled: true,
    agent: { enableDataAccess: true, enableComposerQueries: true },
    isDeepResearch: false,
    hasStandardToolAllowlist: false,
};

describe('isComposerQueriesEnabled', () => {
    it('uses composer when flags are on and the agent opted in', () => {
        expect(isComposerQueriesEnabled(optedIn)).toBe(true);
    });

    it('keeps classic tools when the agent has not opted in, even with flags on', () => {
        expect(
            isComposerQueriesEnabled({
                ...optedIn,
                agent: { enableDataAccess: true, enableComposerQueries: false },
            }),
        ).toBe(false);
    });

    it.each([
        ['multi-source-query flag off', { multiSourceQueryEnabled: false }],
        ['compose-sql-runner flag off', { composeSqlRunnerEnabled: false }],
        [
            'data access off',
            {
                agent: { enableDataAccess: false, enableComposerQueries: true },
            },
        ],
        ['deep research', { isDeepResearch: true }],
        ['standard tool allowlist', { hasStandardToolAllowlist: true }],
    ])('is off with %s', (_, override) => {
        expect(isComposerQueriesEnabled({ ...optedIn, ...override })).toBe(
            false,
        );
    });
});
