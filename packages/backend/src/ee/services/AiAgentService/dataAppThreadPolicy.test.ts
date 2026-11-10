import { DATA_APP_INVESTIGATE_TOOL_NAMES } from '../ai/agents/agentV2';
import { canRunContentQuerySql } from '../ai/tools/runContentQuery';
import {
    canStartDeepResearch,
    resolveStandardToolAllowlist,
} from './dataAppThreadPolicy';

describe('resolveStandardToolAllowlist', () => {
    it('pins data-app threads to the read-only investigate tools', () => {
        expect(resolveStandardToolAllowlist('data_app', undefined)).toBe(
            DATA_APP_INVESTIGATE_TOOL_NAMES,
        );
        expect(
            resolveStandardToolAllowlist('data_app', new Set(['runSql'])),
        ).toBe(DATA_APP_INVESTIGATE_TOOL_NAMES);
    });

    it('leaves other threads to the caller', () => {
        const requested = new Set(['grepFields']);
        expect(resolveStandardToolAllowlist('web_app', requested)).toBe(
            requested,
        );
        expect(
            resolveStandardToolAllowlist('slack', undefined),
        ).toBeUndefined();
    });

    it('refuses deep research on a data-app thread', () => {
        expect(canStartDeepResearch('data_app')).toBe(false);
        expect(canStartDeepResearch('web_app')).toBe(true);
    });

    it('never lets a data-app thread write or reach outside the project', () => {
        for (const tool of [
            'saveChart',
            'createDashboard',
            'runSql',
            'externalFetch',
            'generateDataApp',
        ]) {
            expect(DATA_APP_INVESTIGATE_TOOL_NAMES.has(tool)).toBe(false);
        }
    });
});

describe('canRunContentQuerySql', () => {
    it('gives data-app threads no raw SQL through runContentQuery', () => {
        expect(
            canRunContentQuerySql({
                canRunSql: true,
                toolAllowlist: DATA_APP_INVESTIGATE_TOOL_NAMES,
            }),
        ).toBe(false);
    });

    it('follows SQL mode when the run allows runSql', () => {
        expect(
            canRunContentQuerySql({ canRunSql: true, toolAllowlist: null }),
        ).toBe(true);
        expect(
            canRunContentQuerySql({ canRunSql: false, toolAllowlist: null }),
        ).toBe(false);
        expect(
            canRunContentQuerySql({
                canRunSql: true,
                toolAllowlist: new Set(['runContentQuery', 'runSql']),
            }),
        ).toBe(true);
    });
});
