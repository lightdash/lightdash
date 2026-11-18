import { describe, expect, it } from 'vitest';
import {
    getComposerQueryShape,
    NO_COMPOSER_QUERY_SHAPE,
} from './composerQueryShape';

const semanticLayer = (
    nodeId: string,
    exploreName: string,
    dimensions: string[],
) => ({
    sourceType: 'semanticLayer',
    nodeId,
    exploreName,
    dimensions,
    metrics: [`${exploreName}_count`],
    filters: { dimensions: `${exploreName}_status equals="${nodeId}"` },
});

const merge = (nodeId: string, sources: string[]) => ({
    sourceType: 'merge',
    nodeId,
    sources: sources.map((source) => ({ nodeId: source })),
    joinType: 'full',
});

describe('getComposerQueryShape', () => {
    it('counts four slices of one explore at one grain, joined by a merge and read by SQL', () => {
        const slices = ['a', 'b', 'c', 'd'];
        expect(
            getComposerQueryShape('query', {
                queries: [
                    ...slices.map((slice) =>
                        semanticLayer(slice, 'orders', ['orders_day']),
                    ),
                    merge('merged', slices),
                    {
                        sourceType: 'duckdb',
                        nodeId: 'ranked',
                        sql: 'SELECT * FROM merged',
                        references: ['merged'],
                    },
                ],
            }),
        ).toEqual({
            composerSemanticLayerNodeCount: 4,
            composerExploreCount: 1,
            composerMaxSameGrainNodeCount: 4,
            composerMergeNodeCount: 1,
            composerSingleExploreMergeNodeCount: 1,
            composerMultiExploreMergeNodeCount: 0,
        });
    });

    it('counts a merge of two explores as multi-explore, with no shared grain', () => {
        expect(
            getComposerQueryShape('query', {
                queries: [
                    semanticLayer('orders', 'orders', ['orders_day']),
                    semanticLayer('payments', 'payments', ['payments_day']),
                    merge('merged', ['orders', 'payments']),
                ],
            }),
        ).toMatchObject({
            composerExploreCount: 2,
            composerMaxSameGrainNodeCount: 1,
            composerSingleExploreMergeNodeCount: 0,
            composerMultiExploreMergeNodeCount: 1,
        });
    });

    it('counts a single node as a group of one', () => {
        expect(
            getComposerQueryShape('query', {
                queries: [semanticLayer('orders', 'orders', ['orders_day'])],
            }),
        ).toMatchObject({
            composerMaxSameGrainNodeCount: 1,
            composerMergeNodeCount: 0,
        });
    });

    it('keeps one explore read at two grains in separate groups', () => {
        expect(
            getComposerQueryShape('query', {
                queries: [
                    semanticLayer('daily', 'orders', ['orders_day']),
                    semanticLayer('monthly', 'orders', ['orders_month']),
                ],
            }).composerMaxSameGrainNodeCount,
        ).toBe(1);
    });

    it('treats the same dimensions, reordered or repeated, as one grain', () => {
        expect(
            getComposerQueryShape('query', {
                queries: [
                    semanticLayer('a', 'orders', ['orders_day', 'orders_type']),
                    semanticLayer('b', 'orders', [
                        'orders_type',
                        'orders_day',
                        'orders_day',
                    ]),
                ],
            }).composerMaxSameGrainNodeCount,
        ).toBe(2);
    });

    it('leaves a merge undecided when a source from an earlier call could be another explore', () => {
        expect(
            getComposerQueryShape('query', {
                queries: [
                    semanticLayer('a', 'orders', ['orders_day']),
                    merge('merged', ['a', 'from_an_earlier_call']),
                ],
            }),
        ).toMatchObject({
            composerMergeNodeCount: 1,
            composerSingleExploreMergeNodeCount: 0,
            composerMultiExploreMergeNodeCount: 0,
        });
    });

    it('leaves a merge undecided when the call repeats a source node id', () => {
        const duplicates = [
            semanticLayer('a', 'payments', ['payments_day']),
            semanticLayer('a', 'orders', ['orders_day']),
        ];
        const shapes = [duplicates, [...duplicates].reverse()].map((nodes) =>
            getComposerQueryShape('query', {
                queries: [
                    ...nodes,
                    semanticLayer('b', 'orders', ['orders_day']),
                    merge('merged', ['a', 'b']),
                ],
            }),
        );
        expect(shapes[0]).toEqual(shapes[1]);
        expect(shapes[0]).toMatchObject({
            composerExploreCount: 2,
            composerSingleExploreMergeNodeCount: 0,
            composerMultiExploreMergeNodeCount: 0,
        });
    });

    it('counts a merge as multi-explore once two of its sources differ, whatever the rest', () => {
        expect(
            getComposerQueryShape('query', {
                queries: [
                    semanticLayer('a', 'orders', ['orders_day']),
                    semanticLayer('b', 'payments', ['payments_day']),
                    merge('merged', ['a', 'b', 'from_an_earlier_call']),
                ],
            }).composerMultiExploreMergeNodeCount,
        ).toBe(1);
    });

    it('is all nulls for another tool', () => {
        expect(
            getComposerQueryShape('visualize', {
                queries: [semanticLayer('orders', 'orders', ['orders_day'])],
            }),
        ).toEqual(NO_COMPOSER_QUERY_SHAPE);
    });

    it('is all nulls for more nodes than a submission may hold', () => {
        expect(
            getComposerQueryShape('query', {
                queries: Array.from({ length: 1000 }, (_, index) =>
                    semanticLayer(`n${index}`, 'orders', [`orders_${index}`]),
                ),
            }),
        ).toEqual(NO_COMPOSER_QUERY_SHAPE);
    });

    it('is all nulls for input that is not a list of nodes', () => {
        expect(getComposerQueryShape('query', { queries: 'orders' })).toEqual(
            NO_COMPOSER_QUERY_SHAPE,
        );
    });
});
