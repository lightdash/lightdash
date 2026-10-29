import { isComposerQueriesEnabled } from './composerQueriesGate';

const optedIn = {
    composeSqlRunnerEnabled: true,
    agent: { enableDataAccess: true, enableComposerQueries: true },
    isDeepResearch: false,
    hasStandardToolAllowlist: false,
    battleProfile: null,
};

const settingOff = {
    ...optedIn,
    agent: { enableDataAccess: true, enableComposerQueries: false },
};

describe('isComposerQueriesEnabled', () => {
    it('uses composer when the flag is on and the agent opted in', () => {
        expect(isComposerQueriesEnabled(optedIn)).toBe(true);
    });

    it('keeps classic tools when the agent has not opted in, even with the flag on', () => {
        expect(isComposerQueriesEnabled(settingOff)).toBe(false);
    });

    it.each([
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

    describe('battle profiles', () => {
        it('composer profile ignores the agent setting', () => {
            expect(
                isComposerQueriesEnabled({
                    ...settingOff,
                    battleProfile: 'composer',
                }),
            ).toBe(true);
        });

        it('classic profile keeps classic tools when the agent setting is on', () => {
            expect(
                isComposerQueriesEnabled({
                    ...optedIn,
                    battleProfile: 'classic',
                }),
            ).toBe(false);
        });

        it.each([
            ['compose-sql-runner flag off', { composeSqlRunnerEnabled: false }],
            [
                'data access off',
                {
                    agent: {
                        enableDataAccess: false,
                        enableComposerQueries: false,
                    },
                },
            ],
            ['deep research', { isDeepResearch: true }],
            ['standard tool allowlist', { hasStandardToolAllowlist: true }],
        ])('composer profile is off with %s', (_, override) => {
            expect(
                isComposerQueriesEnabled({
                    ...settingOff,
                    battleProfile: 'composer',
                    ...override,
                }),
            ).toBe(false);
        });

        it.each(['fast', 'baseline', 'luna'] as const)(
            '%s profile follows the agent setting',
            (battleProfile) => {
                expect(
                    isComposerQueriesEnabled({ ...optedIn, battleProfile }),
                ).toBe(true);
                expect(
                    isComposerQueriesEnabled({ ...settingOff, battleProfile }),
                ).toBe(false);
            },
        );
    });
});
