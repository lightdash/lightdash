import { ParameterError } from './errors';
import {
    buildRoadmapItem,
    findForbiddenRoadmapFields,
    mapLinearStateToRoadmapStatus,
    redactRoadmapItem,
    RoadmapItemStatus,
    type RoadmapItem,
} from './roadmap';

describe('mapLinearStateToRoadmapStatus', () => {
    it.each([
        ['Triage', RoadmapItemStatus.BACKLOG],
        ['Backlog', RoadmapItemStatus.BACKLOG],
        ['Todo', RoadmapItemStatus.PLANNED],
        ['Planned', RoadmapItemStatus.PLANNED],
        ['In Progress', RoadmapItemStatus.BUILDING],
        ['Done', RoadmapItemStatus.SHIPPED],
        ['Canceled', RoadmapItemStatus.NOT_PLANNED],
    ])('maps state name "%s" to %s', (name, expected) => {
        expect(
            mapLinearStateToRoadmapStatus({ name, type: 'ignored' }),
        ).toBe(expected);
    });

    it('matches state names case-insensitively', () => {
        expect(
            mapLinearStateToRoadmapStatus({ name: 'IN PROGRESS', type: '' }),
        ).toBe(RoadmapItemStatus.BUILDING);
    });

    it('falls back to canonical state type when the name is renamed', () => {
        expect(
            mapLinearStateToRoadmapStatus({
                name: 'In dev review',
                type: 'started',
            }),
        ).toBe(RoadmapItemStatus.BUILDING);
    });

    it('returns null when neither name nor type is recognised', () => {
        expect(
            mapLinearStateToRoadmapStatus({ name: 'Wishlist', type: 'custom' }),
        ).toBeNull();
    });
});

describe('buildRoadmapItem', () => {
    it('builds a curated item with the mapped status', () => {
        expect(
            buildRoadmapItem({
                id: 'abc',
                title: 'Dark mode',
                description: 'Please add dark mode',
                state: { name: 'In Progress', type: 'started' },
            }),
        ).toEqual<RoadmapItem>({
            id: 'abc',
            title: 'Dark mode',
            description: 'Please add dark mode',
            status: RoadmapItemStatus.BUILDING,
        });
    });

    it('throws when the Linear state cannot be mapped', () => {
        expect(() =>
            buildRoadmapItem({
                id: 'abc',
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
                id: '1',
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
            id: '1',
            title: 'Dark mode',
            description: 'body',
            status: RoadmapItemStatus.SHIPPED,
        });
        expect(Object.keys(result)).toEqual([
            'id',
            'title',
            'description',
            'status',
        ]);
    });

    it('rejects payloads containing a forbidden field', () => {
        expect(() =>
            redactRoadmapItem({
                id: '1',
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
                id: '1',
                title: 'Dark mode',
                description: null,
                status: RoadmapItemStatus.BACKLOG,
            }).description,
        ).toBeNull();
    });

    it.each([
        ['missing id', { title: 't', description: null, status: RoadmapItemStatus.BACKLOG }],
        ['missing title', { id: '1', description: null, status: RoadmapItemStatus.BACKLOG }],
        [
            'invalid description',
            { id: '1', title: 't', description: 5, status: RoadmapItemStatus.BACKLOG },
        ],
        ['invalid status', { id: '1', title: 't', description: null, status: 'Whenever' }],
    ])('rejects %s', (_label, raw) => {
        expect(() =>
            redactRoadmapItem(raw as Record<string, unknown>),
        ).toThrow(ParameterError);
    });
});
