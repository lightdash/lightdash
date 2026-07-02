import { ParameterError } from './errors';
import {
    buildRoadmapItem,
    findForbiddenRoadmapFields,
    mapLinearStateToRoadmapStatus,
    redactRoadmapItem,
    redactRoadmapItems,
    RoadmapItemStatus,
    type RoadmapItem,
} from './roadmap';

describe('mapLinearStateToRoadmapStatus', () => {
    it.each([
        ['triage', RoadmapItemStatus.BACKLOG],
        ['backlog', RoadmapItemStatus.BACKLOG],
        ['unstarted', RoadmapItemStatus.PLANNED],
        ['started', RoadmapItemStatus.BUILDING],
        ['completed', RoadmapItemStatus.SHIPPED],
        ['canceled', RoadmapItemStatus.NOT_PLANNED],
    ])('maps canonical state type "%s" to %s', (type, expected) => {
        expect(mapLinearStateToRoadmapStatus({ name: 'ignored', type })).toBe(
            expected,
        );
    });

    it('prefers the canonical type over a renamed state name', () => {
        // a started state renamed to "Done" must still map to Building
        expect(
            mapLinearStateToRoadmapStatus({ name: 'Done', type: 'started' }),
        ).toBe(RoadmapItemStatus.BUILDING);
    });

    it('falls back to the state name when the type is missing', () => {
        expect(
            mapLinearStateToRoadmapStatus({ name: 'In Progress', type: '' }),
        ).toBe(RoadmapItemStatus.BUILDING);
    });

    it('falls back to the state name when the type is unrecognised', () => {
        expect(
            mapLinearStateToRoadmapStatus({
                name: 'Canceled',
                type: 'custom',
            }),
        ).toBe(RoadmapItemStatus.NOT_PLANNED);
    });

    it('matches the name fallback case-insensitively', () => {
        expect(
            mapLinearStateToRoadmapStatus({ name: 'IN PROGRESS', type: '' }),
        ).toBe(RoadmapItemStatus.BUILDING);
    });

    it('returns null when neither type nor name is recognised', () => {
        expect(
            mapLinearStateToRoadmapStatus({ name: 'Wishlist', type: 'custom' }),
        ).toBeNull();
    });
});

describe('buildRoadmapItem', () => {
    it('builds a curated item with the mapped status', () => {
        expect(
            buildRoadmapItem({
                title: 'Dark mode',
                description: 'Please add dark mode',
                state: { name: 'In Progress', type: 'started' },
            }),
        ).toEqual<RoadmapItem>({
            title: 'Dark mode',
            description: 'Please add dark mode',
            status: RoadmapItemStatus.BUILDING,
        });
    });

    it('throws when the Linear state cannot be mapped', () => {
        expect(() =>
            buildRoadmapItem({
                title: 'Dark mode',
                description: null,
                state: { name: 'Wishlist', type: 'custom' },
            }),
        ).toThrow(ParameterError);
    });
});

describe('findForbiddenRoadmapFields', () => {
    it('detects known internal fields', () => {
        expect(
            findForbiddenRoadmapFields({
                title: 'x',
                arr: 50000,
                comments: [],
            }),
        ).toEqual(expect.arrayContaining(['arr', 'comments']));
    });

    it('returns an empty array for a clean item', () => {
        expect(
            findForbiddenRoadmapFields({
                title: 'x',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
            }),
        ).toEqual([]);
    });
});

describe('redactRoadmapItem', () => {
    it('strips fields outside the allowlist', () => {
        const result = redactRoadmapItem({
            id: '1',
            title: 'Dark mode',
            description: 'body',
            status: RoadmapItemStatus.SHIPPED,
            url: 'https://internal',
            sortOrder: 3,
        });
        expect(result).toEqual<RoadmapItem>({
            title: 'Dark mode',
            description: 'body',
            status: RoadmapItemStatus.SHIPPED,
        });
        expect(Object.keys(result)).toEqual(['title', 'description', 'status']);
    });

    it('rejects payloads containing a forbidden field', () => {
        expect(() =>
            redactRoadmapItem({
                title: 'Dark mode',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
                arr: 50000,
            }),
        ).toThrow(ParameterError);
    });

    it('allows a null description', () => {
        expect(
            redactRoadmapItem({
                title: 'Dark mode',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
            }).description,
        ).toBeNull();
    });

    it.each([
        [
            'missing title',
            { description: null, status: RoadmapItemStatus.BACKLOG },
        ],
        [
            'invalid description',
            { title: 't', description: 5, status: RoadmapItemStatus.BACKLOG },
        ],
        [
            'invalid status',
            { title: 't', description: null, status: 'Whenever' },
        ],
    ])('rejects %s', (_label, raw) => {
        expect(() => redactRoadmapItem(raw as Record<string, unknown>)).toThrow(
            ParameterError,
        );
    });
});

describe('redactRoadmapItems', () => {
    it('redacts every item when all are clean', () => {
        const result = redactRoadmapItems([
            {
                title: 'Dark mode',
                description: 'body',
                status: RoadmapItemStatus.SHIPPED,
                id: 'leak',
            },
            {
                title: 'Filters',
                description: null,
                status: RoadmapItemStatus.PLANNED,
            },
        ]);
        expect(result.items).toEqual<RoadmapItem[]>([
            {
                title: 'Dark mode',
                description: 'body',
                status: RoadmapItemStatus.SHIPPED,
            },
            {
                title: 'Filters',
                description: null,
                status: RoadmapItemStatus.PLANNED,
            },
        ]);
        expect(result.rejected).toEqual([]);
    });

    it('excludes a forbidden item rather than failing the whole list', () => {
        const result = redactRoadmapItems([
            {
                title: 'Dark mode',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
            },
            {
                title: 'Leaky',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
                arr: 50000,
            },
        ]);
        expect(result.items).toEqual<RoadmapItem[]>([
            {
                title: 'Dark mode',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
            },
        ]);
        expect(result.rejected).toHaveLength(1);
    });

    it('captures the offending item title on a rejection for internal triage', () => {
        const result = redactRoadmapItems([
            {
                title: 'Leaky',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
                arr: 50000,
            },
        ]);
        expect(result.rejected).toEqual([
            { title: 'Leaky', reason: expect.stringContaining('arr') },
        ]);
    });

    it('excludes malformed items and never throws', () => {
        const result = redactRoadmapItems([
            { description: null, status: RoadmapItemStatus.BACKLOG },
            { title: 't', description: null, status: 'Whenever' },
        ]);
        expect(result.items).toEqual([]);
        expect(result.rejected).toHaveLength(2);
    });

    it('leaves the rejection title undefined when the raw title is unusable', () => {
        const result = redactRoadmapItems([
            { title: 42, description: null, status: RoadmapItemStatus.BACKLOG },
        ]);
        expect(result.rejected).toEqual([
            { title: undefined, reason: expect.any(String) },
        ]);
    });
});
