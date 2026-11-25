import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getComposerLineageTourSteps } from './steps';

const semantic: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
};
const merge: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'joined',
    title: 'Joined',
    sql: 'SELECT * FROM orders',
    references: ['orders'],
};
const python: SourceQuery = {
    sourceType: QuerySourceType.PYTHON,
    nodeId: 'forecast',
    title: 'Forecast',
    code: 'def run(inputs, params): return inputs["joined"]',
    references: ['joined'],
};

const stepsFor = (queries: SourceQuery[], terminalNodeId: string) =>
    getComposerLineageTourSteps({
        scope: '[data-panel]',
        queries,
        terminalNodeId,
        saveInMenu: true,
        canAddToChat: true,
    });

describe('getComposerLineageTourSteps', () => {
    it('points the graph and cell steps at the most notable step', () => {
        const cases = [
            {
                queries: [semantic, merge, python],
                terminal: 'forecast',
                focused: 'forecast',
            },
            {
                queries: [semantic, merge],
                terminal: 'joined',
                focused: 'joined',
            },
            {
                queries: [semantic, { ...semantic, nodeId: 'b' }],
                terminal: 'b',
                focused: 'b',
            },
        ];
        const graphTitles = cases.map(({ queries, terminal, focused }) => {
            const [, graph, cell] = stepsFor(queries, terminal);
            expect(cell.target).toContain(`[data-node-id="${focused}"]`);
            return graph.title;
        });
        // Python, merge and plain pipelines each get their own graph copy.
        expect(new Set(graphTitles).size).toBe(3);
    });

    it('centres the save step when the menu cannot save', () => {
        const steps = getComposerLineageTourSteps({
            scope: '[data-panel]',
            queries: [semantic, merge],
            terminalNodeId: 'joined',
            saveInMenu: false,
            canAddToChat: true,
        });
        expect(steps.at(-1)?.target).toBeNull();
    });
});
