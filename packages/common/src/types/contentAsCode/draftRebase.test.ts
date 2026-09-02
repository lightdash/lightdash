import {
    asCodeFieldsChangedBetween,
    computeContentDraftStaleness,
    describeAsCodeFieldChange,
    describeContentDraftStaleness,
    overlayKeysForAsCodeField,
} from './draftRebase';

const base = {
    name: 'Revenue',
    description: 'Before',
    tiles: [{ properties: { chartSlug: 'a' } }],
    tabs: [],
    spaceSlug: 'sales',
};

describe('asCodeFieldsChangedBetween', () => {
    it('lists the fields whose canonical value differs', () => {
        expect(
            asCodeFieldsChangedBetween(base, {
                ...base,
                description: 'After',
                tiles: [],
            }),
        ).toEqual(['description', 'tiles']);
        expect(asCodeFieldsChangedBetween(base, base)).toEqual([]);
    });

    it('counts fields added or removed on either side', () => {
        expect(
            asCodeFieldsChangedBetween(base, { ...base, filters: {} }),
        ).toEqual(['filters']);
    });
});

describe('computeContentDraftStaleness', () => {
    it('only conflicts on fields the draft also changed', () => {
        const staleness = computeContentDraftStaleness({
            draftUuid: 'd',
            contentType: 'dashboard',
            base,
            current: { ...base, description: 'After', tiles: [] },
            overlay: { tiles: [{ x: 1 }], name: 'Revenue 2' },
        });
        expect(staleness).toEqual({
            draftUuid: 'd',
            changedFields: ['description', 'tiles'],
            conflictingFields: ['tiles'],
        });
    });

    it('maps DAO overlay keys onto as-code fields', () => {
        const staleness = computeContentDraftStaleness({
            draftUuid: 'd',
            contentType: 'chart',
            base: { spaceSlug: 'sales' },
            current: { spaceSlug: 'finance' },
            overlay: { spaceUuid: 'uuid', verified: true },
        });
        expect(staleness.conflictingFields).toEqual(['spaceSlug']);
    });
});

describe('overlayKeysForAsCodeField', () => {
    it('finds the overlay keys behind an as-code field', () => {
        expect(overlayKeysForAsCodeField('dashboard', 'spaceSlug')).toEqual([
            'spaceUuid',
        ]);
        expect(overlayKeysForAsCodeField('chart', 'metricQuery')).toEqual([
            'metricQuery',
        ]);
        expect(overlayKeysForAsCodeField('chart', 'unknown')).toEqual([]);
    });
});

describe('describeAsCodeFieldChange', () => {
    it('reads scalar changes as before and after', () => {
        expect(describeAsCodeFieldChange('description', 'Old', 'New')).toBe(
            '"Old" → "New"',
        );
        expect(describeAsCodeFieldChange('description', undefined, 'New')).toBe(
            'set to "New"',
        );
    });

    it('counts tiles by identity and names them', () => {
        const chart = {
            type: 'saved_chart',
            x: 0,
            properties: { chartSlug: 'mrr', title: 'MRR' },
        };
        expect(
            describeAsCodeFieldChange(
                'tiles',
                [chart],
                [
                    chart,
                    {
                        type: 'markdown',
                        properties: { title: 'Admin tile', content: 'x' },
                    },
                ],
            ),
        ).toBe('added 1 tile (Admin tile)');
        expect(
            describeAsCodeFieldChange('tiles', [chart], [{ ...chart, x: 6 }]),
        ).toBe('changed 1 tile (MRR)');
        expect(describeAsCodeFieldChange('tiles', [chart], [])).toBe(
            'removed 1 tile (MRR)',
        );
        expect(
            describeAsCodeFieldChange('tiles', [chart], [{ ...chart, x: 6 }], {
                reportEdits: false,
            }),
        ).toBe('edited tiles');
    });

    it('lists the keys that moved inside an object field', () => {
        expect(
            describeAsCodeFieldChange(
                'metricQuery',
                { limit: 10, metrics: ['a'] },
                { limit: 500, metrics: ['a'] },
            ),
        ).toBe('changed limit');
    });
});

describe('describeContentDraftStaleness', () => {
    it('describes both sides of a conflict and one side of a repo-only change', () => {
        const details = describeContentDraftStaleness({
            staleness: {
                draftUuid: 'd',
                changedFields: ['description', 'tiles'],
                conflictingFields: ['tiles'],
            },
            base: { description: 'Old', tiles: [] },
            current: {
                description: 'New',
                tiles: [{ type: 'markdown', properties: { title: 'Admin' } }],
            },
            draft: {
                description: 'Old',
                tiles: [{ type: 'markdown', properties: { title: 'Mine' } }],
            },
        });
        expect(details.changes).toEqual([
            { field: 'description', repo: '"Old" → "New"', mine: null },
            {
                field: 'tiles',
                repo: 'added 1 tile (Admin)',
                mine: 'added 1 tile (Mine)',
            },
        ]);
    });
});
