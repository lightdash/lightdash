import { compareCaptureRoute } from './compareCaptureRoute';
import { loadCaptureRouterEvalFixtures } from './fixtures';

// These check the fixture files are well formed. Whether the model agrees
// with them is checked by hand: pnpm -F backend capture-router-evals

const fixtures = loadCaptureRouterEvalFixtures();

describe('capture router eval fixtures', () => {
    it('has at least the ten agreed cases', () => {
        expect(fixtures.length).toBeGreaterThanOrEqual(10);
    });

    it.each(fixtures)('$file is well formed', ({ fixture }) => {
        const { request, expected } = fixture;
        const tileUuids = new Set(request.tiles.map((tile) => tile.uuid));

        expect(fixture.name).not.toEqual('');
        expect(request.gridColumns).toBe(36);
        // No screenshots: the cases must stand on tiles, marks and words.
        expect(request.images).toEqual([]);
        request.marks.forEach((mark) => expect(mark.image).toBe(0));

        // Everything a mark points at is a tile on the dashboard.
        const markTiles = request.marks.flatMap((mark) => [
            mark.at.tileUuid,
            mark.arrowTo?.tileUuid ?? null,
            ...mark.path.map((place) => place.tileUuid),
            ...mark.inside.map((cover) => cover.tileUuid),
        ]);
        markTiles
            .filter((uuid) => uuid !== null)
            .forEach((uuid) => expect(tileUuids).toContain(uuid));

        // Everything expected back is about a tile on the dashboard, and
        // layout operations fit the grid, so cleaning would not change them.
        expected.layout.forEach((op) => {
            const tile = request.tiles.find((t) => t.uuid === op.tileUuid);
            expect(tile).toBeDefined();
            if (!tile) return;
            if (op.type === 'swap') {
                expect(tileUuids).toContain(op.withTileUuid);
            }
            if (op.type === 'move') {
                expect(op.x + tile.w).toBeLessThanOrEqual(request.gridColumns);
            }
            if (op.type === 'resize') {
                expect(tile.x + op.w).toBeLessThanOrEqual(request.gridColumns);
            }
        });
        [...expected.questions, ...expected.edits].forEach((item) =>
            item.tileUuids.forEach((uuid) => expect(tileUuids).toContain(uuid)),
        );

        // The expected answer passes its own comparison.
        expect(
            compareCaptureRoute({
                expected,
                actual: expected,
                tiles: request.tiles,
                piles: fixture.piles,
            }),
        ).toEqual([]);
    });
});
