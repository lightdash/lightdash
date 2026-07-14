import { type DashboardTab } from '../types/dashboard';
import { resolveExportTabs } from './exportTabs';

const tab = (uuid: string, order: number, hidden?: boolean): DashboardTab => ({
    uuid,
    name: `Tab ${uuid}`,
    order,
    hidden,
});

describe('resolveExportTabs', () => {
    const tabs = [tab('c', 2), tab('a', 0), tab('b', 1, true)];

    it('returns all non-hidden tabs in order when selectedTabs is null', () => {
        expect(resolveExportTabs(tabs, null).map((t) => t.uuid)).toEqual([
            'a',
            'c',
        ]);
    });

    it('returns explicitly selected tabs in dashboard order, including hidden', () => {
        expect(resolveExportTabs(tabs, ['c', 'b']).map((t) => t.uuid)).toEqual([
            'b',
            'c',
        ]);
    });

    it('ignores selected uuids that no longer exist', () => {
        expect(
            resolveExportTabs(tabs, ['a', 'deleted']).map((t) => t.uuid),
        ).toEqual(['a']);
    });

    it('returns empty array for untabbed dashboards', () => {
        expect(resolveExportTabs([], null)).toEqual([]);
    });

    it('does not mutate the input array', () => {
        const input = [tab('c', 2), tab('a', 0)];
        const snapshot = [...input];
        resolveExportTabs(input, null);
        expect(input).toEqual(snapshot);
    });
});
