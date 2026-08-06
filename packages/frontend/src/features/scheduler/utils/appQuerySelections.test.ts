import {
    type AppQuerySelection,
    type DeliveryCaptureManifest,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    areAllQuerySelectionsExcluded,
    buildAppQueryPickerRows,
    hasExcludedQuerySelections,
    toAppQuerySelections,
} from './appQuerySelections';

const readyItem = (
    overrides: Partial<
        Extract<DeliveryCaptureManifest['items'][number], { status: 'ready' }>
    > = {},
) => ({
    status: 'ready' as const,
    captureKey: 'v1:key-a',
    label: 'Revenue',
    exploreName: 'orders',
    queryUuid: 'query-a',
    order: 0,
    rowCount: 12,
    limitReached: false,
    ...overrides,
});

const errorItem = (
    overrides: Partial<
        Extract<DeliveryCaptureManifest['items'][number], { status: 'error' }>
    > = {},
) => ({
    status: 'error' as const,
    captureKey: 'v1:key-err',
    label: 'Broken',
    exploreName: 'orders',
    queryUuid: null,
    order: 1,
    error: 'boom',
    ...overrides,
});

const manifest = (
    items: DeliveryCaptureManifest['items'],
    overflowCount = 0,
): DeliveryCaptureManifest => ({ version: 1, items, overflowCount });

const selection = (
    overrides: Partial<AppQuerySelection> = {},
): AppQuerySelection => ({
    captureKey: 'v1:key-a',
    label: 'Revenue',
    exploreName: 'orders',
    excluded: false,
    ...overrides,
});

describe('buildAppQueryPickerRows', () => {
    it('includes every fresh item, unexcluded, when there is no snapshot', () => {
        const rows = buildAppQueryPickerRows(
            manifest([readyItem(), errorItem()]),
            null,
        );

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            kind: 'ready',
            captureKey: 'v1:key-a',
            excluded: false,
            identityChanged: false,
            rowCount: 12,
            limitReached: false,
        });
        expect(rows[1]).toMatchObject({
            kind: 'error',
            captureKey: 'v1:key-err',
            excluded: false,
            error: 'boom',
        });
    });

    it('orders rows by capture order, not manifest array order', () => {
        const rows = buildAppQueryPickerRows(
            manifest([
                readyItem({ captureKey: 'v1:key-b', order: 1, label: 'B' }),
                readyItem({ captureKey: 'v1:key-a', order: 0, label: 'A' }),
            ]),
            null,
        );

        expect(rows.map((r) => r.label)).toEqual(['A', 'B']);
    });

    it('applies the saved excluded state on an exact captureKey match', () => {
        const rows = buildAppQueryPickerRows(
            manifest([readyItem(), errorItem()]),
            [
                selection({ excluded: true }),
                selection({
                    captureKey: 'v1:key-err',
                    label: 'Broken',
                    excluded: true,
                }),
            ],
        );

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            excluded: true,
            identityChanged: false,
        });
        // Error items honour exact-match exclusions too.
        expect(rows[1]).toMatchObject({ kind: 'error', excluded: true });
    });

    it('includes fresh items missing from the snapshot by default', () => {
        const rows = buildAppQueryPickerRows(
            manifest([
                readyItem(),
                readyItem({
                    captureKey: 'v1:key-new',
                    label: 'Brand new',
                    exploreName: 'customers',
                    order: 1,
                }),
            ]),
            [selection({ excluded: true })],
        );

        expect(rows[1]).toMatchObject({
            captureKey: 'v1:key-new',
            excluded: false,
            identityChanged: false,
        });
    });

    it('renders snapshot entries that did not run as toggleable missing rows', () => {
        const rows = buildAppQueryPickerRows(manifest([readyItem()]), [
            selection(),
            selection({
                captureKey: 'v1:key-gone',
                label: 'Gone query',
                exploreName: 'customers',
                excluded: true,
            }),
        ]);

        expect(rows).toHaveLength(2);
        expect(rows[1]).toEqual({
            kind: 'missing',
            captureKey: 'v1:key-gone',
            label: 'Gone query',
            exploreName: 'customers',
            excluded: true,
        });
    });

    it('flags an identity change on a label+explore match with a different key and never trusts the stale exclusion', () => {
        const rows = buildAppQueryPickerRows(
            manifest([readyItem({ captureKey: 'v1:key-a2' })]),
            [selection({ excluded: true })],
        );

        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            kind: 'ready',
            captureKey: 'v1:key-a2',
            excluded: false,
            identityChanged: true,
        });
    });

    it('does not render a fuzzy-resolved stale entry as a missing row', () => {
        const rows = buildAppQueryPickerRows(
            manifest([readyItem({ captureKey: 'v1:key-a2' })]),
            [selection({ excluded: true })],
        );

        expect(rows.some((row) => row.kind === 'missing')).toBe(false);
    });

    it('credits an identity-changed hint to only the first of several items sharing one stale entry', () => {
        const rows = buildAppQueryPickerRows(
            manifest([
                readyItem({ captureKey: 'v1:key-a2', order: 0 }),
                readyItem({ captureKey: 'v1:key-a3', order: 1 }),
            ]),
            [selection({ excluded: true })],
        );

        expect(
            rows.map((row) => row.kind !== 'missing' && row.identityChanged),
        ).toEqual([true, false]);
    });

    it('never fuzzy-matches error items', () => {
        const rows = buildAppQueryPickerRows(
            manifest([errorItem({ captureKey: 'v1:key-err2' })]),
            [
                selection({
                    captureKey: 'v1:key-err',
                    label: 'Broken',
                    excluded: true,
                }),
            ],
        );

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            kind: 'error',
            excluded: false,
            identityChanged: false,
        });
        expect(rows[1]).toMatchObject({
            kind: 'missing',
            captureKey: 'v1:key-err',
        });
    });
});

describe('toAppQuerySelections', () => {
    it('snapshots every row, including missing rows, with only the persisted fields', () => {
        const rows = buildAppQueryPickerRows(manifest([readyItem()]), [
            selection({
                captureKey: 'v1:key-gone',
                label: 'Gone query',
                excluded: true,
            }),
        ]);

        expect(toAppQuerySelections(rows)).toEqual([
            {
                captureKey: 'v1:key-a',
                label: 'Revenue',
                exploreName: 'orders',
                excluded: false,
            },
            {
                captureKey: 'v1:key-gone',
                label: 'Gone query',
                exploreName: 'orders',
                excluded: true,
            },
        ]);
    });
});

describe('selection guards', () => {
    it('hasExcludedQuerySelections is false for null and all-included snapshots', () => {
        expect(hasExcludedQuerySelections(null)).toBe(false);
        expect(hasExcludedQuerySelections([selection()])).toBe(false);
        expect(
            hasExcludedQuerySelections([selection({ excluded: true })]),
        ).toBe(true);
    });

    it('areAllQuerySelectionsExcluded only fires on a non-empty fully excluded snapshot', () => {
        expect(areAllQuerySelectionsExcluded(null)).toBe(false);
        expect(areAllQuerySelectionsExcluded([])).toBe(false);
        expect(
            areAllQuerySelectionsExcluded([
                selection({ excluded: true }),
                selection({ captureKey: 'v1:key-b' }),
            ]),
        ).toBe(false);
        expect(
            areAllQuerySelectionsExcluded([
                selection({ excluded: true }),
                selection({ captureKey: 'v1:key-b', excluded: true }),
            ]),
        ).toBe(true);
    });
});
