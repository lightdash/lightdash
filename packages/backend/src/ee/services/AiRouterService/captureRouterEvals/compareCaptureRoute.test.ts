import { type CaptureRoute } from '@lightdash/common';
import { compareCaptureRoute } from './compareCaptureRoute';

const route = (parts: Partial<CaptureRoute>): CaptureRoute => ({
    layout: [],
    questions: [],
    edits: [],
    ...parts,
});

const tiles = [
    { uuid: 'rev', title: 'Revenue', x: 0, y: 0, w: 18, h: 6 },
    { uuid: 'ord', title: 'Orders', x: 18, y: 0, w: 18, h: 6 },
];

describe('compareCaptureRoute', () => {
    it('passes two empty routes', () => {
        expect(
            compareCaptureRoute({ expected: route({}), actual: route({}) }),
        ).toEqual([]);
    });

    describe('layout', () => {
        it('accepts operations in any order', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        layout: [
                            { type: 'move', tileUuid: 'rev', x: 0, y: 8 },
                            { type: 'resize', tileUuid: 'ord', w: 36, h: 6 },
                        ],
                    }),
                    actual: route({
                        layout: [
                            { type: 'resize', tileUuid: 'ord', w: 36, h: 6 },
                            { type: 'move', tileUuid: 'rev', x: 0, y: 8 },
                        ],
                    }),
                }),
            ).toEqual([]);
        });

        it('accepts a move within one grid cell', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        layout: [
                            { type: 'move', tileUuid: 'rev', x: 18, y: 8 },
                        ],
                    }),
                    actual: route({
                        layout: [
                            { type: 'move', tileUuid: 'rev', x: 17, y: 9 },
                        ],
                    }),
                }),
            ).toEqual([]);
        });

        it('rejects a move more than one grid cell away', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        layout: [
                            { type: 'move', tileUuid: 'rev', x: 18, y: 8 },
                        ],
                    }),
                    actual: route({
                        layout: [
                            { type: 'move', tileUuid: 'rev', x: 18, y: 10 },
                        ],
                    }),
                    tiles,
                }),
            ).toEqual([
                'layout: missing move "Revenue" to x=18 y=8',
                'layout: unexpected move "Revenue" to x=18 y=10',
            ]);
        });

        it('accepts a resize within one grid cell and rejects one beyond', () => {
            const expected = route({
                layout: [{ type: 'resize', tileUuid: 'rev', w: 36, h: 6 }],
            });
            expect(
                compareCaptureRoute({
                    expected,
                    actual: route({
                        layout: [
                            { type: 'resize', tileUuid: 'rev', w: 35, h: 7 },
                        ],
                    }),
                }),
            ).toEqual([]);
            expect(
                compareCaptureRoute({
                    expected,
                    actual: route({
                        layout: [
                            { type: 'resize', tileUuid: 'rev', w: 18, h: 6 },
                        ],
                    }),
                }),
            ).toEqual([
                'layout: missing resize rev to w=36 h=6',
                'layout: unexpected resize rev to w=18 h=6',
            ]);
        });

        it('treats a swap the same in either direction', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        layout: [
                            {
                                type: 'swap',
                                tileUuid: 'rev',
                                withTileUuid: 'ord',
                            },
                        ],
                    }),
                    actual: route({
                        layout: [
                            {
                                type: 'swap',
                                tileUuid: 'ord',
                                withTileUuid: 'rev',
                            },
                        ],
                    }),
                }),
            ).toEqual([]);
        });

        it('rejects a swap with the wrong tile', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        layout: [
                            {
                                type: 'swap',
                                tileUuid: 'rev',
                                withTileUuid: 'ord',
                            },
                        ],
                    }),
                    actual: route({
                        layout: [
                            {
                                type: 'swap',
                                tileUuid: 'rev',
                                withTileUuid: 'title',
                            },
                        ],
                    }),
                    tiles,
                }),
            ).toEqual([
                'layout: missing swap "Revenue" with "Orders"',
                'layout: unexpected swap "Revenue" with title',
            ]);
        });

        it('rejects a different operation on the same tile', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        layout: [{ type: 'move', tileUuid: 'rev', x: 0, y: 8 }],
                    }),
                    actual: route({
                        layout: [
                            { type: 'resize', tileUuid: 'rev', w: 18, h: 6 },
                        ],
                    }),
                }),
            ).toHaveLength(2);
        });

        it('reports extra and missing operations', () => {
            expect(
                compareCaptureRoute({
                    expected: route({}),
                    actual: route({
                        layout: [{ type: 'move', tileUuid: 'rev', x: 0, y: 8 }],
                    }),
                }),
            ).toEqual(['layout: unexpected move rev to x=0 y=8']);
            expect(
                compareCaptureRoute({
                    expected: route({
                        layout: [{ type: 'move', tileUuid: 'rev', x: 0, y: 8 }],
                    }),
                    actual: route({}),
                }),
            ).toEqual(['layout: missing move rev to x=0 y=8']);
        });

        it('does not let one operation satisfy two expected ones', () => {
            const move = { type: 'move', tileUuid: 'rev', x: 0, y: 8 } as const;
            expect(
                compareCaptureRoute({
                    expected: route({ layout: [move, move] }),
                    actual: route({ layout: [move] }),
                }),
            ).toEqual(['layout: missing move rev to x=0 y=8']);
        });
    });

    describe('questions and edits', () => {
        it('ignores wording, order and the order of tiles', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        questions: [
                            {
                                text: 'Why did revenue dip?',
                                tileUuids: ['rev'],
                            },
                            {
                                text: 'How do these compare?',
                                tileUuids: ['rev', 'ord'],
                            },
                        ],
                        edits: [{ text: 'Add a filter', tileUuids: [] }],
                    }),
                    actual: route({
                        questions: [
                            {
                                text: 'Compare Revenue and Orders.',
                                tileUuids: ['ord', 'rev'],
                            },
                            {
                                text: 'What caused the dip in Revenue?',
                                tileUuids: ['rev'],
                            },
                        ],
                        edits: [
                            {
                                text: 'Add a region filter to the dashboard',
                                tileUuids: [],
                            },
                        ],
                    }),
                }),
            ).toEqual([]);
        });

        it('rejects questions merged into one', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        questions: [
                            { text: 'a', tileUuids: ['rev'] },
                            { text: 'b', tileUuids: ['ord'] },
                        ],
                    }),
                    actual: route({
                        questions: [
                            { text: 'a and b', tileUuids: ['rev', 'ord'] },
                        ],
                    }),
                    tiles,
                }),
            ).toEqual([
                'questions: expected 2, got 1',
                'questions: missing one about "Revenue"',
                'questions: missing one about "Orders"',
                'questions: unexpected one about "Orders" + "Revenue": "a and b"',
            ]);
        });

        it('rejects the right count on the wrong tiles', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        edits: [{ text: 'a', tileUuids: ['rev'] }],
                    }),
                    actual: route({
                        edits: [{ text: 'b', tileUuids: [] }],
                    }),
                }),
            ).toEqual([
                'edits: missing one about rev',
                'edits: unexpected one about no tiles: "b"',
            ]);
        });

        it('rejects a question filed as an edit', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        questions: [{ text: 'a', tileUuids: ['rev'] }],
                    }),
                    actual: route({
                        edits: [{ text: 'a', tileUuids: ['rev'] }],
                    }),
                }),
            ).toEqual([
                'questions: expected 1, got 0',
                'questions: missing one about rev',
                'edits: expected 0, got 1',
                'edits: unexpected one about rev: "a"',
            ]);
        });

        it('counts a repeated tile once', () => {
            expect(
                compareCaptureRoute({
                    expected: route({
                        questions: [{ text: 'a', tileUuids: ['rev'] }],
                    }),
                    actual: route({
                        questions: [{ text: 'a', tileUuids: ['rev', 'rev'] }],
                    }),
                }),
            ).toEqual([]);
        });
    });

    it('only compares the piles it is asked to', () => {
        const actual = route({
            edits: [{ text: 'Add the churn chart', tileUuids: [] }],
        });
        expect(
            compareCaptureRoute({
                expected: route({}),
                actual,
                piles: ['layout'],
            }),
        ).toEqual([]);
        expect(
            compareCaptureRoute({ expected: route({}), actual }),
        ).toHaveLength(2);
    });
});
