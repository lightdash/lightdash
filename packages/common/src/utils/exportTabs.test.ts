import { type DashboardTab } from '../types/dashboard';
import {
    getPagedExportOrphanHomeTabUuid,
    isTileInPagedExport,
    resolveExportTabs,
} from './exportTabs';

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

describe('getPagedExportOrphanHomeTabUuid', () => {
    it('returns the first resolved tab uuid', () => {
        expect(getPagedExportOrphanHomeTabUuid(['a', 'c'])).toBe('a');
    });

    it('returns null when nothing is resolved', () => {
        expect(getPagedExportOrphanHomeTabUuid([])).toBeNull();
    });
});

describe('isTileInPagedExport', () => {
    it('renders a tabbed tile only when its tab is resolved', () => {
        expect(isTileInPagedExport({ tabUuid: 'a' }, ['a', 'c'])).toBe(true);
        expect(isTileInPagedExport({ tabUuid: 'b' }, ['a', 'c'])).toBe(false);
    });

    it('renders orphan tiles when there is an orphan-home tab', () => {
        expect(isTileInPagedExport({ tabUuid: null }, ['a', 'c'])).toBe(true);
        expect(isTileInPagedExport({ tabUuid: undefined }, ['a'])).toBe(true);
    });

    it('drops orphan tiles when no tab is resolved', () => {
        expect(isTileInPagedExport({ tabUuid: null }, [])).toBe(false);
    });
});

// Fix 3: orphan-home must be the first RENDER-ELIGIBLE tab, not the literal
// first dashboard tab, so orphans survive a hidden/unselected first tab.
describe('paged-export orphan-home resolution (resolveExportTabs + helpers)', () => {
    const resolved = (tabs: DashboardTab[], selection: string[] | null) =>
        resolveExportTabs(tabs, selection).map((t) => t.uuid);

    it('null selection with a hidden first tab homes orphans on the first visible tab', () => {
        const tabs = [tab('a', 0, true), tab('b', 1), tab('c', 2)];
        const uuids = resolved(tabs, null);
        expect(uuids).toEqual(['b', 'c']);
        expect(getPagedExportOrphanHomeTabUuid(uuids)).toBe('b');
        expect(isTileInPagedExport({ tabUuid: null }, uuids)).toBe(true);
    });

    it('explicit subset excluding tab 1 homes orphans on the first selected tab', () => {
        const tabs = [tab('a', 0), tab('b', 1), tab('c', 2)];
        const uuids = resolved(tabs, ['b', 'c']);
        expect(uuids).toEqual(['b', 'c']);
        expect(getPagedExportOrphanHomeTabUuid(uuids)).toBe('b');
        expect(isTileInPagedExport({ tabUuid: null }, uuids)).toBe(true);
    });

    it('orphan-only dashboard (no tabs) has no orphan-home and excludes orphans from the paged set', () => {
        const uuids = resolved([], null);
        expect(uuids).toEqual([]);
        expect(getPagedExportOrphanHomeTabUuid(uuids)).toBeNull();
        expect(isTileInPagedExport({ tabUuid: null }, uuids)).toBe(false);
    });
});
