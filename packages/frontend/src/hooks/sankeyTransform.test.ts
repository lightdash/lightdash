import { type ResultRow } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { transformSankeyData } from './sankeyTransform';

const cell = (formatted: string, raw: unknown = formatted) => ({
    value: { raw, formatted },
});

const row = (source: string, target: string, weight: number): ResultRow => ({
    src: cell(source),
    tgt: cell(target),
    val: cell(String(weight), weight),
});

const FIELDS = {
    sourceFieldId: 'src',
    targetFieldId: 'tgt',
    metricFieldId: 'val',
};

type Data = ReturnType<typeof transformSankeyData>;

const nodeIds = (data: Data) => data.nodes.map((n) => n.name).sort();
const nodeLabels = (data: Data) => data.nodes.map((n) => n.label).sort();
const sourceTargets = (data: Data) =>
    data.links.map((l) => `${l.source}→${l.target}`).sort();

describe('transformSankeyData', () => {
    it('returns empty for no rows', () => {
        expect(
            transformSankeyData([], FIELDS, { nodeLayout: 'multi-step' }),
        ).toEqual({ nodes: [], links: [], maxDepth: 0, hasCycle: false });
    });

    it('sums the metric across rows sharing a source→target pair', () => {
        const data = transformSankeyData(
            [row('A', 'B', 3), row('A', 'B', 4)],
            FIELDS,
            { nodeLayout: 'merged' },
        );

        expect(data.links).toHaveLength(1);
        expect(data.links[0].value).toBe(7);
        expect(data.links[0].meta.rows).toHaveLength(2);
    });

    it('skips rows with a non-positive or non-numeric metric', () => {
        const data = transformSankeyData(
            [row('A', 'B', 0), row('A', 'C', -5), row('A', 'D', 2)],
            FIELDS,
            { nodeLayout: 'merged' },
        );

        expect(sourceTargets(data)).toEqual(['A→D']);
    });

    // C is reached at two depths (A→C and A→B→C), so it lands at two depths.
    const diamond = [row('A', 'B', 1), row('A', 'C', 1), row('B', 'C', 1)];

    describe('multi-step', () => {
        it('splits a multi-depth label into "Step N" nodes', () => {
            const data = transformSankeyData(diamond, FIELDS, {
                nodeLayout: 'multi-step',
            });

            expect(data.hasCycle).toBe(false);
            expect(nodeIds(data)).toEqual([
                'A',
                'B',
                'C - Step 1',
                'C - Step 2',
            ]);
            // both "Step" instances still display as plain "C"
            expect(nodeLabels(data)).toEqual(['A', 'B', 'C', 'C']);
        });
    });

    describe('merged', () => {
        it('collapses same-label nodes into one for acyclic data', () => {
            const data = transformSankeyData(diamond, FIELDS, {
                nodeLayout: 'merged',
            });

            expect(data.hasCycle).toBe(false);
            expect(nodeIds(data)).toEqual(['A', 'B', 'C']);
            expect(sourceTargets(data)).toEqual(['A→B', 'A→C', 'B→C']);
            expect(data.maxDepth).toBe(2);
        });

        it('falls back to multi-step (and reports a cycle) for cyclic data', () => {
            const data = transformSankeyData(
                [row('A', 'B', 1), row('B', 'A', 1)],
                FIELDS,
                { nodeLayout: 'merged' },
            );

            expect(data.hasCycle).toBe(true);
            expect(data.nodes.some((n) => / - Step \d+$/.test(n.name))).toBe(
                true,
            );
        });
    });

    describe('direct', () => {
        it('renders a bipartite source→target view with no chaining', () => {
            const data = transformSankeyData(diamond, FIELDS, {
                nodeLayout: 'direct',
            });

            expect(data.maxDepth).toBe(1);
            expect(data.links).toHaveLength(3);

            // no node is both a link source and a link target (strict 2 columns)
            const sources = new Set(data.links.map((l) => l.source));
            const targets = new Set(data.links.map((l) => l.target));
            expect([...sources].some((s) => targets.has(s))).toBe(false);

            // "B" is both a source and a target, so it appears on both sides
            expect(nodeLabels(data)).toEqual(['A', 'B', 'B', 'C']);
        });

        it('handles cyclic data without error', () => {
            const data = transformSankeyData(
                [row('A', 'B', 1), row('B', 'A', 1)],
                FIELDS,
                { nodeLayout: 'direct' },
            );

            expect(data.hasCycle).toBe(true);
            expect(data.links).toHaveLength(2);
            expect(data.nodes.some((n) => / - Step \d+$/.test(n.name))).toBe(
                false,
            );
        });
    });

    it('treats a self-loop as a cycle', () => {
        const data = transformSankeyData([row('A', 'A', 1)], FIELDS, {
            nodeLayout: 'merged',
        });

        expect(data.hasCycle).toBe(true);
    });
});
