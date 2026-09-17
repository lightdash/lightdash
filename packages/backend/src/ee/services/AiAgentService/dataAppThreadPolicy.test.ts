import { DATA_APP_INVESTIGATE_TOOL_NAMES } from '../ai/agents/agentV2';
import { resolveStandardToolAllowlist } from './dataAppThreadPolicy';

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
