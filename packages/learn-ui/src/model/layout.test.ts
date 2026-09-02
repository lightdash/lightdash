import { describe, expect, it } from 'vitest';
import { ScopeGroup } from '../scope/types';
import { BOARD_WIDTH, buildLayout, seatMap, type LayoutModule } from './layout';

const mod = (
    id: string,
    group: LayoutModule['group'],
    unlocked = true,
): LayoutModule => ({
    id,
    group,
    unlocked,
});

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

describe('buildLayout rows and columns', () => {
    it('uses one row for up to three live groups and two rows beyond', () => {
        const three = buildLayout([
            mod('a', 'foundations'),
            mod('b', ScopeGroup.CONTENT),
            mod('c', ScopeGroup.DATA),
        ]);
        expect(three.height).toBe(60 + 320 + 40);
        const four = buildLayout([
            mod('a', 'foundations'),
            mod('b', ScopeGroup.CONTENT),
            mod('c', ScopeGroup.DATA),
            mod('d', ScopeGroup.AI),
        ]);
        expect(four.height).toBe(60 + 2 * 320 + 40);
        expect(four.width).toBe(BOARD_WIDTH);
    });

    it('ignores groups with nothing unlocked when counting live groups', () => {
        const layout = buildLayout([
            mod('a', 'foundations'),
            mod('b', ScopeGroup.CONTENT, false),
        ]);
        expect(layout.captions.map((c) => c.group)).toEqual(['foundations']);
        expect(layout.height).toBe(60 + 320 + 40);
    });
});

describe('buildLayout seats', () => {
    it('seats a single unlocked module at the cluster centre', () => {
        const layout = buildLayout([mod('a', 'foundations')]);
        const [node] = layout.nodes;
        expect(node).toMatchObject({ x: BOARD_WIDTH / 2, y: 60 + 160 + 16 });
    });

    it('shares the ring evenly among unlocked modules with a 78px floor', () => {
        const layout = buildLayout([
            mod('a', 'foundations'),
            mod('b', 'foundations'),
            mod('c', 'foundations'),
        ]);
        const centre = { x: BOARD_WIDTH / 2, y: 60 + 160 + 16 };
        layout.nodes.forEach((n) => expect(dist(n, centre)).toBeCloseTo(78, 5));
        expect(layout.nodes[0].y).toBeCloseTo(centre.y - 78, 5);
    });

    it('grows the ring with many modules', () => {
        const many = Array.from({ length: 12 }, (_, i) =>
            mod(`m${i}`, 'foundations'),
        );
        const layout = buildLayout(many);
        const centre = { x: BOARD_WIDTH / 2, y: 60 + 160 + 16 };
        expect(dist(layout.nodes[0], centre)).toBeCloseTo(
            (12 * 54) / (2 * Math.PI),
            5,
        );
    });

    it('parks locked modules at their cluster centre, dead groups at the board centre', () => {
        const layout = buildLayout([
            mod('a', 'foundations'),
            mod('b', 'foundations', false),
            mod('c', ScopeGroup.AI, false),
        ]);
        const byId = new Map(layout.nodes.map((n) => [n.id, n]));
        expect(byId.get('b')).toMatchObject({
            x: BOARD_WIDTH / 2,
            y: 60 + 160 + 16,
            unlocked: false,
        });
        expect(byId.get('c')).toMatchObject({
            x: BOARD_WIDTH / 2,
            y: 60 + 160,
        });
    });

    it('seats exactly the unlocked modules on the ring', () => {
        const modules = [
            mod('a', 'foundations'),
            mod('b', 'foundations'),
            mod('c', 'foundations'),
            mod('d', 'foundations', false),
        ];
        const layout = buildLayout(modules);
        const centre = { x: BOARD_WIDTH / 2, y: 60 + 160 + 16 };
        expect(layout.nodes.filter((n) => dist(n, centre) > 0)).toHaveLength(
            modules.filter((m) => m.unlocked).length,
        );
    });

    it('seatMap matches buildLayout seats', () => {
        const modules = [mod('a', 'foundations'), mod('b', ScopeGroup.CONTENT)];
        const seats = seatMap(modules);
        buildLayout(modules).nodes.forEach((n) =>
            expect(seats.get(n.id)).toEqual({ x: n.x, y: n.y }),
        );
    });
});

describe('buildLayout connectors and captions', () => {
    it('ring links join consecutive unlocked nodes and skip locked ones', () => {
        const layout = buildLayout([
            mod('a', 'foundations'),
            mod('b', 'foundations', false),
            mod('c', 'foundations'),
            mod('d', 'foundations'),
        ]);
        expect(layout.connectors.filter((c) => c.kind === 'ring')).toHaveLength(
            3,
        );
    });

    it('draws one ring link for a pair and none for a single node', () => {
        expect(
            buildLayout([
                mod('a', 'foundations'),
                mod('b', 'foundations'),
            ]).connectors.filter((c) => c.kind === 'ring'),
        ).toHaveLength(1);
        expect(buildLayout([mod('a', 'foundations')]).connectors).toHaveLength(
            0,
        );
    });

    it('trunk links join horizontal neighbours plus the first and last column verticals', () => {
        const groups: LayoutModule['group'][] = [
            'foundations',
            ScopeGroup.CONTENT,
            ScopeGroup.DATA,
            ScopeGroup.AI,
            ScopeGroup.PROJECT_MANAGEMENT,
            ScopeGroup.ORGANIZATION_MANAGEMENT,
        ];
        const layout = buildLayout(groups.map((g, i) => mod(`m${i}`, g)));
        // 2 rows x 3 cols: 2 horizontal per row + 2 verticals
        expect(
            layout.connectors.filter((c) => c.kind === 'trunk'),
        ).toHaveLength(6);
    });

    it('draws one horizontal trunk and no verticals for a 1x2 grid', () => {
        const layout = buildLayout([
            mod('a', 'foundations'),
            mod('b', ScopeGroup.CONTENT),
        ]);
        const trunks = layout.connectors.filter((c) => c.kind === 'trunk');
        expect(trunks).toHaveLength(1);
        expect(trunks[0].y1).toBe(trunks[0].y2);
    });

    it('trims every connector by 22px at both ends', () => {
        const layout = buildLayout([
            mod('a', 'foundations'),
            mod('b', 'foundations'),
        ]);
        const [ring] = layout.connectors;
        expect(Math.hypot(ring.x2 - ring.x1, ring.y2 - ring.y1)).toBeCloseTo(
            2 * 78 - 44,
            5,
        );
    });

    it('anchors the caption above the ring with unlocked / total counts', () => {
        const layout = buildLayout([
            mod('a', 'foundations'),
            mod('b', 'foundations'),
            mod('c', 'foundations', false),
        ]);
        const [cap] = layout.captions;
        expect(cap).toMatchObject({
            group: 'foundations',
            unlocked: 2,
            total: 3,
        });
        expect(cap.x).toBe(BOARD_WIDTH / 2 - 75);
        expect(cap.y).toBe(60 + 160 + 16 - 78 - 22);
    });
});
