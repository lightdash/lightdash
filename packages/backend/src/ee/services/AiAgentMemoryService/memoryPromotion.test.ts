import {
    buildMemoryPromotionEntry,
    getMemoryPromotionFingerprint,
} from './memoryPromotion';

describe('buildMemoryPromotionEntry', () => {
    const memory = {
        terms: ['revenue', 'completed orders'],
        objects: [
            { type: 'explore' as const, name: 'orders' },
            {
                type: 'field' as const,
                explore: 'orders',
                fieldId: 'orders_status',
            },
        ],
    };

    it('copies source memory metadata onto a created entry', () => {
        expect(
            buildMemoryPromotionEntry({
                proposal: {
                    op: 'create',
                    id: null,
                    kind: 'context',
                    content: 'Use completed orders for revenue.',
                    title: null,
                    apply: null,
                },
                memory,
                currentEntries: [],
            }),
        ).toMatchObject(memory);
    });

    it('merges source metadata into an updated entry', () => {
        expect(
            buildMemoryPromotionEntry({
                proposal: {
                    op: 'update',
                    id: 'revenue',
                    kind: 'definition',
                    content: 'Revenue means completed-order revenue.',
                    title: null,
                    apply: null,
                },
                memory,
                currentEntries: [
                    {
                        id: 'revenue',
                        kind: 'definition',
                        content: 'Revenue means gross revenue.',
                        terms: ['revenue', 'gross revenue'],
                        objects: [
                            { type: 'explore', name: 'orders' },
                            'legacy_orders',
                        ],
                    },
                ],
            }),
        ).toEqual({
            op: 'update',
            id: 'revenue',
            kind: 'definition',
            content: 'Revenue means completed-order revenue.',
            title: null,
            apply: null,
            terms: ['revenue', 'gross revenue', 'completed orders'],
            objects: [
                { type: 'explore', name: 'orders' },
                'legacy_orders',
                {
                    type: 'field',
                    explore: 'orders',
                    fieldId: 'orders_status',
                },
            ],
        });
    });
});

describe('getMemoryPromotionFingerprint', () => {
    it('hashes organization, project, and memory identity deterministically', () => {
        expect(
            getMemoryPromotionFingerprint({
                organizationUuid: 'org-1',
                projectUuid: 'project-1',
                memoryUuid: 'memory-1',
            }),
        ).toBe(
            'memory:f58d07ef14591edb186cc87e7d46c4966d2d882d10f505ec6c26f2974f3780de',
        );
    });

    it('changes when any identity component changes', () => {
        const base = {
            organizationUuid: 'org-1',
            projectUuid: 'project-1',
            memoryUuid: 'memory-1',
        };
        const values = [
            getMemoryPromotionFingerprint(base),
            getMemoryPromotionFingerprint({
                ...base,
                organizationUuid: 'org-2',
            }),
            getMemoryPromotionFingerprint({
                ...base,
                projectUuid: 'project-2',
            }),
            getMemoryPromotionFingerprint({ ...base, memoryUuid: 'memory-2' }),
        ];

        expect(new Set(values)).toHaveLength(4);
    });
});
