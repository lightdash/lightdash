import {
    isOutsideAgentSpaces,
    spaceScopedPinnedUuid,
} from './pinnedOutsideAgentSpaces';

describe('isOutsideAgentSpaces', () => {
    it('treats an agent with no space list as reaching every space', () => {
        expect(isOutsideAgentSpaces([], 'space-1')).toBe(false);
        expect(isOutsideAgentSpaces([], null)).toBe(false);
    });

    it('checks the space against the agent list', () => {
        expect(isOutsideAgentSpaces(['space-1'], 'space-1')).toBe(false);
        expect(isOutsideAgentSpaces(['space-1'], 'space-2')).toBe(true);
    });

    it('keeps personal apps out of a space-limited agent', () => {
        expect(isOutsideAgentSpaces(['space-1'], null)).toBe(true);
    });
});

describe('spaceScopedPinnedUuid', () => {
    it('returns ids for dashboards, charts and data apps only', () => {
        expect(
            spaceScopedPinnedUuid({ type: 'file', path: 'models/a.sql' }),
        ).toBeNull();
        expect(
            spaceScopedPinnedUuid({
                type: 'data_app',
                appUuid: 'app-1',
                appSlug: null,
                displayName: null,
                pinnedVersion: null,
                isPersonal: false,
            }),
        ).toBe('app-1');
    });
});
