/**
 * Tests for Filter Tree Utilities
 * Comprehensive coverage of normalized filter state management
 */

import {
    FilterGroupOperator,
    FilterOperator,
    type FilterGroup,
    type FilterRule,
    type Filters,
} from '@lightdash/common';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import {
    addFilterRuleToTree,
    convertRuleToGroup,
    createEmptyFilterTree,
    denormalizeFilters,
    moveNode,
    normalizeFilters,
    removeNodeFromTree,
    setGroupOperator,
    updateFilterRule,
    type FilterTreeNode,
    type FilterTreeState,
} from './filterTree';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

const createMockRule = (
    id: string,
    fieldId: string,
    operator: FilterOperator = FilterOperator.EQUALS,
    values: any[] = ['test'],
): FilterRule => ({
    id,
    target: { fieldId },
    operator,
    values,
});

const createDimensionRule = (id: string, fieldId = `dim_${id}`) =>
    createMockRule(id, fieldId);
const createMetricRule = (id: string, fieldId = `metric_${id}`) =>
    createMockRule(id, fieldId);
const createTableCalcRule = (id: string, fieldId = `calc_${id}`) =>
    createMockRule(id, fieldId);

// Deep equality helper that compares Filters structures
const expectFiltersEqual = (actual: Filters, expected: Filters) => {
    expect(actual).toEqual(expected);
};

// Helper for round-trip testing: normalize → denormalize → compare
const expectRoundTrip = (filters: Filters, expected: Filters = filters) => {
    const tree = normalizeFilters(filters);
    const result = denormalizeFilters(tree);
    expectFiltersEqual(result, expected);
};

// Helper to verify tree structure validity
const assertTreeValid = (tree: FilterTreeState) => {
    expect(tree.rootId).toBeDefined();
    expect(tree.byId[tree.rootId]).toBeDefined();
    expect(tree.byId[tree.rootId]?.type).toBe('group');

    // Verify all parent-child relationships are bidirectional
    Object.values(tree.byId).forEach((node) => {
        if (node.type === 'group') {
            node.childIds.forEach((childId) => {
                const child = tree.byId[childId];
                expect(child).toBeDefined();
                expect(child?.parentId).toBe(node.id);
            });
        }
        if (node.parentId) {
            const parent = tree.byId[node.parentId];
            expect(parent).toBeDefined();
            expect(parent?.type).toBe('group');
            if (parent?.type === 'group') {
                expect(parent.childIds).toContain(node.id);
            }
        }
    });
};

// ============================================================================
// normalizeFilters() Tests
// ============================================================================

describe('normalizeFilters', () => {
    describe('simple filters', () => {
        it('should handle empty filters object', () => {
            const tree = normalizeFilters({});

            assertTreeValid(tree);
            expect(tree.byId[tree.rootId]).toMatchObject({
                type: 'group',
                operator: FilterGroupOperator.and,
                childIds: [],
                parentId: null,
            });
        });

        it.each([
            {
                groupKey: 'dimensions' as const,
                ruleId: 'r1',
                createRule: createDimensionRule,
            },
            {
                groupKey: 'metrics' as const,
                ruleId: 'm1',
                createRule: createMetricRule,
            },
            {
                groupKey: 'tableCalculations' as const,
                ruleId: 'tc1',
                createRule: createTableCalcRule,
            },
        ])(
            'should normalize single $groupKey rule',
            ({ groupKey, ruleId, createRule }) => {
                const rule = createRule(ruleId);
                const filters: Filters = {
                    [groupKey]: { id: 'g1', and: [rule] },
                };

                const tree = normalizeFilters(filters);
                assertTreeValid(tree);

                const ruleNode = tree.byId[ruleId];
                expect(ruleNode).toMatchObject({
                    type: 'rule',
                    id: ruleId,
                    groupKey,
                    rule,
                    parentId: tree.rootId,
                });
            },
        );
    });

    describe('AND groups (flattening)', () => {
        it('should flatten dimension AND group with 2 rules to root and preserve wrapper ID', () => {
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const filters: Filters = {
                dimensions: { id: 'wrapper-id', and: [r1, r2] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            // Both rules should be direct children of root
            const rootNode = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootNode.childIds).toContain('r1');
            expect(rootNode.childIds).toContain('r2');

            // Wrapper ID should be preserved
            expect(tree.originalWrapperIds?.dimensions).toBe('wrapper-id');
        });

        it('should flatten mixed dimension AND + metric AND to root', () => {
            const d1 = createDimensionRule('d1');
            const m1 = createMetricRule('m1');
            const filters: Filters = {
                dimensions: { id: 'dim-wrapper', and: [d1] },
                metrics: { id: 'metric-wrapper', and: [m1] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            const rootNode = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootNode.childIds).toContain('d1');
            expect(rootNode.childIds).toContain('m1');
            expect(tree.originalWrapperIds?.dimensions).toBe('dim-wrapper');
            expect(tree.originalWrapperIds?.metrics).toBe('metric-wrapper');
        });

        it('should preserve nested OR group when parent is AND', () => {
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const orGroup: FilterGroup = { id: 'or1', or: [r1, r2] };
            const filters: Filters = {
                dimensions: { id: 'and-wrapper', and: [orGroup] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            // OR group should be preserved
            const orNode = tree.byId.or1;
            expect(orNode).toMatchObject({
                type: 'group',
                operator: FilterGroupOperator.or,
                childIds: ['r1', 'r2'],
                parentId: tree.rootId,
            });
        });
    });

    describe('OR groups (preservation)', () => {
        it('should keep dimension OR group as child of root', () => {
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const filters: Filters = {
                dimensions: { id: 'or1', or: [r1, r2] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            const orNode = tree.byId.or1;
            expect(orNode).toMatchObject({
                type: 'group',
                operator: FilterGroupOperator.or,
                childIds: ['r1', 'r2'],
                parentId: tree.rootId,
            });

            const rootNode = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootNode.childIds).toEqual(['or1']);
        });

        it('should preserve OR groups while flattening AND groups', () => {
            const d1 = createDimensionRule('d1');
            const d2 = createDimensionRule('d2');
            const m1 = createMetricRule('m1');

            const filters: Filters = {
                dimensions: { id: 'or1', or: [d1, d2] },
                metrics: { id: 'and1', and: [m1] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            const rootNode = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootNode.childIds).toContain('or1');
            expect(rootNode.childIds).toContain('m1');

            const orNode = tree.byId.or1;
            expect(orNode?.type).toBe('group');
        });
    });

    describe('complex nested structures', () => {
        it('should handle 3-level nesting: AND > OR > AND', () => {
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const innerAnd: FilterGroup = { id: 'and-inner', and: [r1, r2] };
            const orGroup: FilterGroup = { id: 'or1', or: [innerAnd] };
            const filters: Filters = {
                dimensions: { id: 'and-outer', and: [orGroup] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            // Outer AND flattened, OR preserved, inner AND preserved
            expect(tree.byId.or1).toBeDefined();
            expect(tree.byId['and-inner']).toBeDefined();
        });

        it('should handle mixed filter types with different nesting depths', () => {
            const d1 = createDimensionRule('d1');
            const d2 = createDimensionRule('d2');
            const m1 = createMetricRule('m1');

            const dimOr: FilterGroup = { id: 'or1', or: [d1, d2] };
            const filters: Filters = {
                dimensions: { id: 'dim-wrapper', and: [dimOr] },
                metrics: { id: 'metric-wrapper', and: [m1] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            const rootNode = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootNode.childIds).toContain('or1');
            expect(rootNode.childIds).toContain('m1');
        });

        it('should handle multiple OR groups at same level', () => {
            const d1 = createDimensionRule('d1');
            const d2 = createDimensionRule('d2');
            const d3 = createDimensionRule('d3');

            const or1: FilterGroup = { id: 'or1', or: [d1] };
            const or2: FilterGroup = { id: 'or2', or: [d2, d3] };
            const filters: Filters = {
                dimensions: { id: 'wrapper', and: [or1, or2] },
            };

            const tree = normalizeFilters(filters);
            assertTreeValid(tree);

            const rootNode = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootNode.childIds).toContain('or1');
            expect(rootNode.childIds).toContain('or2');
        });
    });
});

// ============================================================================
// denormalizeFilters() Tests
// ============================================================================

describe('denormalizeFilters', () => {
    describe('basic denormalization', () => {
        it('should handle empty tree', () => {
            const tree = createEmptyFilterTree();
            const filters = denormalizeFilters(tree);
            expect(filters).toEqual({});
        });

        it('should correctly separate rules by groupKey', () => {
            const tree = createEmptyFilterTree();
            const dimRule = createDimensionRule('d1');
            const metricRule = createMetricRule('m1');
            const tcRule = createTableCalcRule('tc1');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', dimRule);
            addFilterRuleToTree(tree, tree.rootId, 'metrics', metricRule);
            addFilterRuleToTree(tree, tree.rootId, 'tableCalculations', tcRule);

            const filters = denormalizeFilters(tree);

            const dimGroup = filters.dimensions;
            const metricGroup = filters.metrics;
            const tcGroup = filters.tableCalculations;

            expect(
                dimGroup && 'and' in dimGroup ? dimGroup.and : [],
            ).toContainEqual(dimRule);
            expect(
                metricGroup && 'and' in metricGroup ? metricGroup.and : [],
            ).toContainEqual(metricRule);
            expect(
                tcGroup && 'and' in tcGroup ? tcGroup.and : [],
            ).toContainEqual(tcRule);
        });
    });

    describe('group unwrapping', () => {
        it('should unwrap single child group', () => {
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const orGroup: FilterGroup = { id: 'or1', or: [r1, r2] };
            const filters: Filters = {
                dimensions: { id: 'wrapper', and: [orGroup] },
            };

            const tree = normalizeFilters(filters);
            const denormalized = denormalizeFilters(tree);

            // Should unwrap to just the OR group
            expect(denormalized.dimensions).toEqual(orGroup);
        });

        it('should wrap multiple rules in AND group', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);

            const filters = denormalizeFilters(tree);

            const dimGroup = filters.dimensions;
            expect(dimGroup && 'and' in dimGroup ? dimGroup.and : []).toEqual([
                r1,
                r2,
            ]);
        });
    });

    describe('wrapper ID preservation', () => {
        it('should use preserved wrapper IDs when denormalizing', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'original-wrapper',
                    and: [createDimensionRule('r1')],
                },
            };

            const tree = normalizeFilters(filters);
            const denormalized = denormalizeFilters(tree);

            expect(denormalized.dimensions?.id).toBe('original-wrapper');
        });
    });
});

// ============================================================================
// Round-Trip Equality Tests
// ============================================================================

describe('normalize/denormalize round-trip equality', () => {
    describe('simple filters', () => {
        it.each([
            {
                type: 'dimension',
                filters: {
                    dimensions: { id: 'g1', and: [createDimensionRule('r1')] },
                } as Filters,
            },
            {
                type: 'metric',
                filters: {
                    metrics: { id: 'g1', and: [createMetricRule('m1')] },
                } as Filters,
            },
            {
                type: 'tableCalculation',
                filters: {
                    tableCalculations: {
                        id: 'g1',
                        and: [createTableCalcRule('tc1')],
                    },
                } as Filters,
            },
        ])('should preserve single $type filter', ({ filters }) => {
            expectRoundTrip(filters);
        });

        it('should preserve mixed: one of each type', () => {
            const filters: Filters = {
                dimensions: { id: 'g1', and: [createDimensionRule('d1')] },
                metrics: { id: 'g2', and: [createMetricRule('m1')] },
                tableCalculations: {
                    id: 'g3',
                    and: [createTableCalcRule('tc1')],
                },
            };

            expectRoundTrip(filters);
        });
    });

    describe('AND groups', () => {
        it('should preserve dimension AND with 2 rules', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    and: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };

            expectRoundTrip(filters);
        });

        it('should preserve all three types with AND groups', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    and: [createDimensionRule('d1'), createDimensionRule('d2')],
                },
                metrics: {
                    id: 'g2',
                    and: [createMetricRule('m1'), createMetricRule('m2')],
                },
                tableCalculations: {
                    id: 'g3',
                    and: [createTableCalcRule('tc1')],
                },
            };

            expectRoundTrip(filters);
        });
    });

    describe('OR groups', () => {
        it('should preserve dimension OR with 2 rules', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    or: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };

            expectRoundTrip(filters);
        });

        it('should preserve mixed types with OR groups', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    or: [createDimensionRule('d1'), createDimensionRule('d2')],
                },
                metrics: {
                    id: 'g2',
                    or: [createMetricRule('m1')],
                },
            };

            expectRoundTrip(filters);
        });
    });

    describe('complex nested structures', () => {
        it('should preserve 2-level nesting: AND > OR', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [
                                createDimensionRule('r1'),
                                createDimensionRule('r2'),
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Single child groups are unwrapped, so AND wrapper is removed
            const expected: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };
            expectFiltersEqual(result, expected);
        });

        it('should preserve 2-level nesting: OR > AND', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [
                        {
                            id: 'and1',
                            and: [
                                createDimensionRule('r1'),
                                createDimensionRule('r2'),
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Single child groups are unwrapped, so OR wrapper is removed
            const expected: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };
            expectFiltersEqual(result, expected);
        });

        it('should preserve 3-level nesting: AND > OR > AND', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and-outer',
                    and: [
                        {
                            id: 'or1',
                            or: [
                                {
                                    id: 'and-inner',
                                    and: [
                                        createDimensionRule('r1'),
                                        createDimensionRule('r2'),
                                    ],
                                },
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Single child groups are unwrapped at each level
            // AND > OR > AND becomes just AND (innermost)
            const expected: Filters = {
                dimensions: {
                    id: 'and-inner',
                    and: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };
            expectFiltersEqual(result, expected);
        });

        it('should preserve 3-level nesting: OR > AND > OR', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or-outer',
                    or: [
                        {
                            id: 'and1',
                            and: [
                                {
                                    id: 'or-inner',
                                    or: [createDimensionRule('r1')],
                                },
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Single child groups are unwrapped at each level
            // OR > AND > OR becomes just OR (innermost)
            const expected: Filters = {
                dimensions: {
                    id: 'or-inner',
                    or: [createDimensionRule('r1')],
                },
            };
            expectFiltersEqual(result, expected);
        });

        it('should preserve 4-level deep nesting', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [
                                {
                                    id: 'and2',
                                    and: [
                                        {
                                            id: 'or2',
                                            or: [createDimensionRule('r1')],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Single child groups are unwrapped at each level
            // 4-level becomes just the innermost OR
            const expected: Filters = {
                dimensions: {
                    id: 'or2',
                    or: [createDimensionRule('r1')],
                },
            };
            expectFiltersEqual(result, expected);
        });
    });

    describe('mixed complexity', () => {
        it('should preserve dimensions OR + metrics AND + tableCalcs OR', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('d1'), createDimensionRule('d2')],
                },
                metrics: {
                    id: 'and1',
                    and: [createMetricRule('m1'), createMetricRule('m2')],
                },
                tableCalculations: {
                    id: 'or2',
                    or: [createTableCalcRule('tc1')],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            expectFiltersEqual(result, filters);
        });

        it('should preserve dimensions nested 3 levels + metrics flat', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [
                                {
                                    id: 'and2',
                                    and: [createDimensionRule('d1')],
                                },
                            ],
                        },
                    ],
                },
                metrics: {
                    id: 'and3',
                    and: [createMetricRule('m1')],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Single child groups unwrapped in dimensions
            const expected: Filters = {
                dimensions: {
                    id: 'and2',
                    and: [createDimensionRule('d1')],
                },
                metrics: {
                    id: 'and3',
                    and: [createMetricRule('m1')],
                },
            };
            expectFiltersEqual(result, expected);
        });

        it('should preserve all three types with different nesting depths', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [
                        {
                            id: 'and1',
                            and: [createDimensionRule('d1')],
                        },
                    ],
                },
                metrics: {
                    id: 'and2',
                    and: [createMetricRule('m1'), createMetricRule('m2')],
                },
                tableCalculations: {
                    id: 'or2',
                    or: [createTableCalcRule('tc1')],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Single child groups unwrapped in dimensions (OR > AND becomes just AND)
            const expected: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [createDimensionRule('d1')],
                },
                metrics: {
                    id: 'and2',
                    and: [createMetricRule('m1'), createMetricRule('m2')],
                },
                tableCalculations: {
                    id: 'or2',
                    or: [createTableCalcRule('tc1')],
                },
            };
            expectFiltersEqual(result, expected);
        });
    });

    describe('edge cases', () => {
        it('should preserve empty filters', () => {
            expectRoundTrip({});
        });

        it.each([
            {
                type: 'dimensions',
                filters: {
                    dimensions: {
                        id: 'g1',
                        and: [createDimensionRule('d1')],
                    },
                } as Filters,
            },
            {
                type: 'metrics',
                filters: {
                    metrics: {
                        id: 'g1',
                        or: [createMetricRule('m1')],
                    },
                } as Filters,
            },
        ])('should preserve filters with only $type', ({ filters }) => {
            expectRoundTrip(filters);
        });
    });

    describe('ID preservation', () => {
        it('should preserve all rule IDs across round-trip', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    and: [
                        createDimensionRule('rule-123'),
                        createDimensionRule('rule-456'),
                    ],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            const dimGroup = result.dimensions;
            const rules = (
                dimGroup && 'and' in dimGroup ? dimGroup.and : []
            ) as FilterRule[];
            expect(rules.map((r) => r.id)).toEqual(['rule-123', 'rule-456']);
        });

        it('should preserve all group IDs including wrapper IDs', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'wrapper-id',
                    and: [
                        createDimensionRule('r1'),
                        {
                            id: 'nested-group-id',
                            or: [
                                createDimensionRule('r2'),
                                createDimensionRule('r3'),
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);
            const result = denormalizeFilters(tree);

            // Wrapper ID is preserved (no unwrapping since there are 2 children)
            expect(result.dimensions?.id).toBe('wrapper-id');
            const dimGroup = result.dimensions;
            const nestedGroup = (
                dimGroup && 'and' in dimGroup ? dimGroup.and?.[1] : undefined
            ) as FilterGroup | undefined;
            expect(nestedGroup?.id).toBe('nested-group-id');
        });
    });
});

// ============================================================================
// createEmptyFilterTree() Tests
// ============================================================================

describe('createEmptyFilterTree', () => {
    it('should create tree with root node', () => {
        const tree = createEmptyFilterTree();

        expect(tree.rootId).toBeDefined();
        expect(tree.byId[tree.rootId]).toBeDefined();
    });

    it('should create root with AND operator', () => {
        const tree = createEmptyFilterTree();
        const root = tree.byId[tree.rootId];

        expect(root?.type).toBe('group');
        if (root?.type === 'group') {
            expect(root.operator).toBe(FilterGroupOperator.and);
        }
    });

    it('should create root with no children', () => {
        const tree = createEmptyFilterTree();
        const root = tree.byId[tree.rootId];

        if (root?.type === 'group') {
            expect(root.childIds).toEqual([]);
        }
    });

    it('should create root with no parent', () => {
        const tree = createEmptyFilterTree();
        const root = tree.byId[tree.rootId];

        expect(root?.parentId).toBeNull();
    });
});

// ============================================================================
// addFilterRuleToTree() Tests
// ============================================================================

describe('addFilterRuleToTree', () => {
    describe('basic additions', () => {
        it.each([
            {
                groupKey: 'dimensions' as const,
                ruleId: 'r1',
                createRule: createDimensionRule,
            },
            {
                groupKey: 'metrics' as const,
                ruleId: 'm1',
                createRule: createMetricRule,
            },
            {
                groupKey: 'tableCalculations' as const,
                ruleId: 'tc1',
                createRule: createTableCalcRule,
            },
        ])(
            'should add $groupKey rule to root',
            ({ groupKey, ruleId, createRule }) => {
                const tree = createEmptyFilterTree();
                const rule = createRule(ruleId);

                addFilterRuleToTree(tree, tree.rootId, groupKey, rule);

                assertTreeValid(tree);
                expect(tree.byId[ruleId]).toMatchObject({
                    type: 'rule',
                    id: ruleId,
                    groupKey,
                    rule,
                    parentId: tree.rootId,
                });
            },
        );
    });

    describe('index positioning', () => {
        it('should add at beginning when index=0', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2, 0);

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds[0]).toBe('r2');
            expect(root.childIds[1]).toBe('r1');
        });

        it('should add at middle when index specified', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const r3 = createDimensionRule('r3');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r3, 1);

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).toEqual(['r1', 'r3', 'r2']);
        });

        it('should append to end when no index specified', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).toEqual(['r1', 'r2']);
        });
    });

    describe('to nested groups', () => {
        it('should add rule to OR group', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1')],
                },
            };
            const tree = normalizeFilters(filters);
            const newRule = createDimensionRule('r2');

            addFilterRuleToTree(tree, 'or1', 'dimensions', newRule);

            assertTreeValid(tree);
            const orNode = tree.byId.or1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(orNode.childIds).toContain('r2');
        });

        it('should add multiple rules to same group', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const r3 = createDimensionRule('r3');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r3);

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).toHaveLength(3);
        });
    });

    describe('error cases', () => {
        it('should throw error for invalid parent ID', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');

            expect(() => {
                addFilterRuleToTree(tree, 'non-existent', 'dimensions', rule);
            }).toThrow('not a valid group');
        });

        it('should throw error when parent is not a group', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);

            const r2 = createDimensionRule('r2');
            expect(() => {
                addFilterRuleToTree(tree, 'r1', 'dimensions', r2);
            }).toThrow('not a valid group');
        });
    });
});

// ============================================================================
// removeNodeFromTree() Tests
// ============================================================================

describe('removeNodeFromTree', () => {
    describe('rule removal', () => {
        it('should remove single rule from root', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            removeNodeFromTree(tree, 'r1');

            expect(tree.byId.r1).toBeUndefined();
            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).not.toContain('r1');
        });

        it('should remove rule from nested group', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };
            const tree = normalizeFilters(filters);

            removeNodeFromTree(tree, 'r1');

            expect(tree.byId.r1).toBeUndefined();
            const orNode = tree.byId.or1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(orNode.childIds).not.toContain('r1');
            expect(orNode.childIds).toContain('r2');
        });

        it('should handle removing non-existent node (no-op)', () => {
            const tree = createEmptyFilterTree();

            expect(() => {
                removeNodeFromTree(tree, 'non-existent');
            }).not.toThrow();
        });
    });

    describe('group removal (recursive)', () => {
        it('should remove OR group with 2 rules (all descendants deleted)', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };
            const tree = normalizeFilters(filters);

            removeNodeFromTree(tree, 'or1');

            expect(tree.byId.or1).toBeUndefined();
            expect(tree.byId.r1).toBeUndefined();
            expect(tree.byId.r2).toBeUndefined();
        });

        it('should remove nested group (3 levels) - entire subtree deleted', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [
                                {
                                    id: 'and2',
                                    and: [createDimensionRule('r1')],
                                },
                            ],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            removeNodeFromTree(tree, 'or1');

            expect(tree.byId.or1).toBeUndefined();
            expect(tree.byId.and2).toBeUndefined();
            expect(tree.byId.r1).toBeUndefined();
        });

        it("should update parent's childIds", () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1')],
                },
            };
            const tree = normalizeFilters(filters);

            removeNodeFromTree(tree, 'or1');

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).not.toContain('or1');
        });
    });

    describe('childIds array handling', () => {
        it('should remove last child from group', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            removeNodeFromTree(tree, 'r1');

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).toHaveLength(0);
        });

        it('should remove from middle of childIds array', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const r3 = createDimensionRule('r3');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r3);

            removeNodeFromTree(tree, 'r2');

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).toEqual(['r1', 'r3']);
        });
    });
});

// ============================================================================
// updateFilterRule() Tests
// ============================================================================

describe('updateFilterRule', () => {
    describe('basic updates', () => {
        it('should update rule operator', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            updateFilterRule(
                tree,
                'r1',
                {
                    operator: FilterOperator.NOT_EQUALS,
                },
                'dimensions',
            );

            const ruleNode = tree.byId.r1;
            expect(ruleNode?.type).toBe('rule');
            if (ruleNode?.type === 'rule') {
                expect(ruleNode.rule.operator).toBe(FilterOperator.NOT_EQUALS);
            }
        });

        it('should update rule values', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            updateFilterRule(
                tree,
                'r1',
                { values: ['new-value'] },
                'dimensions',
            );

            const ruleNode = tree.byId.r1;
            if (ruleNode?.type === 'rule') {
                expect(ruleNode.rule.values).toEqual(['new-value']);
            }
        });

        it('should update rule settings (DateFilterSettings)', () => {
            const tree = createEmptyFilterTree();
            const rule: FilterRule = {
                id: 'r1',
                target: { fieldId: 'date_field' },
                operator: FilterOperator.IN_THE_PAST,
                values: [7],
                settings: { unitOfTime: 'days' as any, completed: false },
            };
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            updateFilterRule(
                tree,
                'r1',
                {
                    settings: { unitOfTime: 'months' as any, completed: true },
                },
                'dimensions',
            );

            const ruleNode = tree.byId.r1;
            if (ruleNode?.type === 'rule') {
                expect(ruleNode.rule.settings).toEqual({
                    unitOfTime: 'months',
                    completed: true,
                });
            }
        });

        it('should update multiple properties at once', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            updateFilterRule(
                tree,
                'r1',
                {
                    operator: FilterOperator.GREATER_THAN,
                    values: [100],
                },
                'dimensions',
            );

            const ruleNode = tree.byId.r1;
            if (ruleNode?.type === 'rule') {
                expect(ruleNode.rule.operator).toBe(
                    FilterOperator.GREATER_THAN,
                );
                expect(ruleNode.rule.values).toEqual([100]);
            }
        });
    });

    describe('error cases', () => {
        it('should throw error for non-existent rule', () => {
            const tree = createEmptyFilterTree();

            expect(() => {
                updateFilterRule(
                    tree,
                    'non-existent',
                    {
                        operator: FilterOperator.EQUALS,
                    },
                    'metrics',
                );
            }).toThrow('Rule non-existent not found');
        });

        it('should throw error when updating group node (not rule)', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1')],
                },
            };
            const tree = normalizeFilters(filters);

            expect(() => {
                updateFilterRule(
                    tree,
                    'or1',
                    {
                        operator: FilterOperator.EQUALS,
                    },
                    'dimensions',
                );
            }).toThrow('Rule or1 not found');
        });
    });
});

// ============================================================================
// moveNode() Tests
// ============================================================================

describe('moveNode', () => {
    describe('move between groups', () => {
        it('should move rule from root to OR group', () => {
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');

            // Create a filter structure with r1 at root and r2 in an OR group
            const filters: Filters = {
                dimensions: {
                    id: 'wrapper',
                    and: [r1, { id: 'or1', or: [r2] }],
                },
            };
            const tree = normalizeFilters(filters);

            // Move r1 into the OR group
            moveNode(tree, 'r1', 'or1');

            assertTreeValid(tree);
            expect(tree.byId.r1?.parentId).toBe('or1');
            const orNode = tree.byId.or1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(orNode.childIds).toContain('r1');
            expect(orNode.childIds).toContain('r2');
        });

        it('should move rule from OR group to root', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };
            const tree = normalizeFilters(filters);

            moveNode(tree, 'r1', tree.rootId);

            assertTreeValid(tree);
            expect(tree.byId.r1?.parentId).toBe(tree.rootId);
            const orNode = tree.byId.or1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(orNode.childIds).not.toContain('r1');
        });

        it('should move rule between two OR groups', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'wrapper',
                    and: [
                        { id: 'or1', or: [createDimensionRule('r1')] },
                        { id: 'or2', or: [createDimensionRule('r2')] },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            moveNode(tree, 'r1', 'or2');

            assertTreeValid(tree);
            const or2Node = tree.byId.or2 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(or2Node.childIds).toContain('r1');
            expect(or2Node.childIds).toContain('r2');
        });
    });

    describe('reordering within group', () => {
        it('should move to specific index in same parent', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const r3 = createDimensionRule('r3');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r3);

            moveNode(tree, 'r3', tree.rootId, 0);

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).toEqual(['r3', 'r1', 'r2']);
        });

        it('should move to beginning', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);

            moveNode(tree, 'r2', tree.rootId, 0);

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds[0]).toBe('r2');
        });

        it('should move to end', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            const r3 = createDimensionRule('r3');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r3);

            moveNode(tree, 'r1', tree.rootId); // No index = append

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(root.childIds).toEqual(['r2', 'r3', 'r1']);
        });
    });

    describe('move entire groups', () => {
        it('should move OR group from root to nested AND group', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'wrapper',
                    and: [
                        { id: 'or1', or: [createDimensionRule('r1')] },
                        { id: 'and1', and: [createDimensionRule('r2')] },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            moveNode(tree, 'or1', 'and1');

            assertTreeValid(tree);
            expect(tree.byId.or1?.parentId).toBe('and1');
            const and1Node = tree.byId.and1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(and1Node.childIds).toContain('or1');
        });

        it('should move nested group to root', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [
                                {
                                    id: 'and2',
                                    and: [createDimensionRule('r1')],
                                },
                            ],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            moveNode(tree, 'and2', tree.rootId);

            assertTreeValid(tree);
            expect(tree.byId.and2?.parentId).toBe(tree.rootId);
        });
    });

    describe('error cases', () => {
        it('should throw error for invalid nodeId', () => {
            const tree = createEmptyFilterTree();

            expect(() => {
                moveNode(tree, 'non-existent', tree.rootId);
            }).toThrow('Node non-existent not found');
        });

        it('should throw error for invalid newParentId', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            expect(() => {
                moveNode(tree, 'r1', 'non-existent');
            }).toThrow('New parent non-existent is not a valid group');
        });

        it('should throw error when target is not a group', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);

            expect(() => {
                moveNode(tree, 'r1', 'r2');
            }).toThrow('New parent r2 is not a valid group');
        });
    });
});

// ============================================================================
// setGroupOperator() Tests
// ============================================================================

describe('setGroupOperator', () => {
    describe('root node special handling', () => {
        it('should create OR groups by filter type when root AND → OR', () => {
            const tree = createEmptyFilterTree();
            const d1 = createDimensionRule('d1');
            const d2 = createDimensionRule('d2');
            const m1 = createMetricRule('m1');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', d1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', d2);
            addFilterRuleToTree(tree, tree.rootId, 'metrics', m1);

            setGroupOperator(tree, tree.rootId, FilterGroupOperator.or);

            assertTreeValid(tree);
            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;

            // Should have 2 OR groups (dimensions and metrics)
            expect(root.childIds).toHaveLength(2);

            // Each child should be an OR group
            root.childIds.forEach((childId) => {
                const child = tree.byId[childId];
                expect(child?.type).toBe('group');
                if (child?.type === 'group') {
                    expect(child.operator).toBe(FilterGroupOperator.or);
                }
            });
        });

        it('should flatten all rules when root OR → AND', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('d1'), createDimensionRule('d2')],
                },
                metrics: {
                    id: 'or2',
                    or: [createMetricRule('m1')],
                },
            };
            const tree = normalizeFilters(filters);

            setGroupOperator(tree, tree.rootId, FilterGroupOperator.and);

            assertTreeValid(tree);
            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;

            // All rules should be direct children of root
            expect(root.childIds).toContain('d1');
            expect(root.childIds).toContain('d2');
            expect(root.childIds).toContain('m1');

            // OR groups should be deleted
            expect(tree.byId.or1).toBeUndefined();
            expect(tree.byId.or2).toBeUndefined();
        });

        it('should delete intermediate groups', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [createDimensionRule('r1')],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            setGroupOperator(tree, tree.rootId, FilterGroupOperator.or);

            // OR group should still exist but and1 wrapper should not
            expect(tree.byId.or1).toBeUndefined();
        });
    });

    describe('non-root nodes', () => {
        it('should change AND → OR with parent match (triggers deduplication)', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [
                        {
                            id: 'and1',
                            and: [
                                createDimensionRule('r1'),
                                createDimensionRule('r2'),
                            ],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            // Change and1 to OR - it will merge with parent OR
            setGroupOperator(tree, 'and1', FilterGroupOperator.or);

            assertTreeValid(tree);
            // and1 should be merged away
            expect(tree.byId.and1).toBeUndefined();

            // Children should now be in or1
            const orNode = tree.byId.or1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(orNode.childIds).toContain('r1');
            expect(orNode.childIds).toContain('r2');
        });

        it('should change OR → AND without parent match', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [createDimensionRule('r1')],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            setGroupOperator(tree, 'or1', FilterGroupOperator.and);

            assertTreeValid(tree);
            const orNode = tree.byId.or1;
            if (orNode?.type === 'group') {
                expect(orNode.operator).toBe(FilterGroupOperator.and);
            }
        });

        it('should do nothing when changing to same operator', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1')],
                },
            };
            const tree = normalizeFilters(filters);
            const before = JSON.stringify(tree);

            setGroupOperator(tree, 'or1', FilterGroupOperator.or);

            const after = JSON.stringify(tree);
            expect(after).toBe(before);
        });
    });

    describe('deduplication (merge with parent)', () => {
        it('should flatten OR group inside OR parent into parent', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or-outer',
                    or: [
                        {
                            id: 'and1',
                            and: [
                                createDimensionRule('r1'),
                                createDimensionRule('r2'),
                            ],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            // Change and1 to OR - should merge with parent OR
            setGroupOperator(tree, 'and1', FilterGroupOperator.or);

            assertTreeValid(tree);
            // and1 should be deleted
            expect(tree.byId.and1).toBeUndefined();

            // Children should be in parent
            const orOuter = tree.byId['or-outer'] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(orOuter.childIds).toContain('r1');
            expect(orOuter.childIds).toContain('r2');
        });

        it('should flatten AND group inside AND parent into parent', () => {
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');

            // Create an OR group with 2 rules at root level (AND wrapper is flattened)
            const filters: Filters = {
                dimensions: { id: 'or1', or: [r1, r2] },
            };
            const tree = normalizeFilters(filters);

            // Change or1 to AND - should merge with root (which is AND)
            setGroupOperator(tree, 'or1', FilterGroupOperator.and);

            assertTreeValid(tree);
            expect(tree.byId.or1).toBeUndefined();

            const rootAfter = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootAfter.childIds).toContain('r1');
            expect(rootAfter.childIds).toContain('r2');
        });

        it('should recursively flatten nested matching groups', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or-outer',
                    or: [
                        {
                            id: 'and1',
                            and: [
                                {
                                    id: 'and2',
                                    and: [createDimensionRule('r1')],
                                },
                            ],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            // Change and1 to OR - should trigger recursive flattening
            setGroupOperator(tree, 'and1', FilterGroupOperator.or);

            assertTreeValid(tree);
            expect(tree.byId.and1).toBeUndefined();

            // and2 should still exist (different operator)
            expect(tree.byId.and2).toBeDefined();
        });
    });

    describe('complex scenarios', () => {
        it('should flatten nested groups when operator changes to match parent', () => {
            // Start with OR1 > AND2 > r1, then change OR1 to AND to trigger cascade
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [
                        {
                            id: 'and2',
                            and: [createDimensionRule('r1')],
                        },
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            // Change or1 to AND - should trigger merge cascade with root (also AND)
            setGroupOperator(tree, 'or1', FilterGroupOperator.and);

            assertTreeValid(tree);
            // Both or1 and and2 should be flattened
            expect(tree.byId.or1).toBeUndefined();
            expect(tree.byId.and2).toBeUndefined();

            const rootAfter = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootAfter.childIds).toContain('r1');
        });

        it('should only merge matching operators in mixed structure', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [
                        {
                            id: 'and1',
                            and: [createDimensionRule('r1')],
                        },
                        createDimensionRule('r2'),
                    ],
                },
            };
            const tree = normalizeFilters(filters);

            // Change and1 to OR - should merge with parent
            setGroupOperator(tree, 'and1', FilterGroupOperator.or);

            assertTreeValid(tree);
            expect(tree.byId.and1).toBeUndefined();

            const or1 = tree.byId.or1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(or1.childIds).toContain('r1');
            expect(or1.childIds).toContain('r2');
        });
    });
});

// ============================================================================
// convertRuleToGroup() Tests
// ============================================================================

describe('convertRuleToGroup', () => {
    describe('basic conversions', () => {
        it('should convert dimension rule to AND group', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            convertRuleToGroup(tree, 'r1', 'new-and', FilterGroupOperator.and);

            assertTreeValid(tree);
            expect(tree.byId['new-and']).toMatchObject({
                type: 'group',
                operator: FilterGroupOperator.and,
                childIds: ['r1'],
                parentId: tree.rootId,
            });

            expect(tree.byId.r1?.parentId).toBe('new-and');
        });

        it('should convert metric rule to OR group', () => {
            const tree = createEmptyFilterTree();
            const rule = createMetricRule('m1');
            addFilterRuleToTree(tree, tree.rootId, 'metrics', rule);

            convertRuleToGroup(tree, 'm1', 'new-or', FilterGroupOperator.or);

            assertTreeValid(tree);
            expect(tree.byId['new-or']).toMatchObject({
                type: 'group',
                operator: FilterGroupOperator.or,
                childIds: ['m1'],
            });
        });

        it('should verify rule is now child of new group', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', rule);

            convertRuleToGroup(tree, 'r1', 'g1', FilterGroupOperator.and);

            const group = tree.byId.g1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(group.childIds).toContain('r1');

            const ruleNode = tree.byId.r1;
            expect(ruleNode?.parentId).toBe('g1');
        });

        it('should verify new group replaces rule in parent', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);

            const root = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            const r1Index = root.childIds.indexOf('r1');

            convertRuleToGroup(tree, 'r1', 'g1', FilterGroupOperator.or);

            const rootAfter = tree.byId[tree.rootId] as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(rootAfter.childIds[r1Index]).toBe('g1');
            expect(rootAfter.childIds).not.toContain('r1');
        });
    });

    describe('in nested structures', () => {
        it('should convert rule inside OR group to AND group', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1'), createDimensionRule('r2')],
                },
            };
            const tree = normalizeFilters(filters);

            convertRuleToGroup(tree, 'r1', 'and1', FilterGroupOperator.and);

            assertTreeValid(tree);
            const andGroup = tree.byId.and1;
            expect(andGroup?.type).toBe('group');
            expect(andGroup?.parentId).toBe('or1');
        });

        it('should convert rule inside AND group to OR group', () => {
            const tree = createEmptyFilterTree();
            const r1 = createDimensionRule('r1');
            const r2 = createDimensionRule('r2');
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', r2);

            convertRuleToGroup(tree, 'r1', 'or1', FilterGroupOperator.or);

            assertTreeValid(tree);
            const orGroup = tree.byId.or1;
            expect(orGroup?.type).toBe('group');
            if (orGroup?.type === 'group') {
                expect(orGroup.operator).toBe(FilterGroupOperator.or);
            }
        });
    });

    describe('error cases', () => {
        it('should throw error for non-existent rule', () => {
            const tree = createEmptyFilterTree();

            expect(() => {
                convertRuleToGroup(
                    tree,
                    'non-existent',
                    'g1',
                    FilterGroupOperator.and,
                );
            }).toThrow('Rule non-existent not found');
        });

        it('should throw error when converting group (not rule)', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('r1')],
                },
            };
            const tree = normalizeFilters(filters);

            expect(() => {
                convertRuleToGroup(tree, 'or1', 'g1', FilterGroupOperator.and);
            }).toThrow('Rule or1 not found');
        });

        it('should throw error when rule has no parent', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');

            // Add rule node directly without parent
            tree.byId.r1 = {
                type: 'rule',
                id: 'r1',
                groupKey: 'dimensions',
                rule,
                parentId: null,
            };

            expect(() => {
                convertRuleToGroup(tree, 'r1', 'g1', FilterGroupOperator.and);
            }).toThrow('Rule r1 has no parent');
        });
    });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('integration tests', () => {
    describe('complex workflows', () => {
        it('should build filter tree from empty and perform multiple operations', () => {
            const tree = createEmptyFilterTree();

            // Add multiple rules
            const d1 = createDimensionRule('d1');
            const d2 = createDimensionRule('d2');
            const m1 = createMetricRule('m1');

            addFilterRuleToTree(tree, tree.rootId, 'dimensions', d1);
            addFilterRuleToTree(tree, tree.rootId, 'dimensions', d2);
            addFilterRuleToTree(tree, tree.rootId, 'metrics', m1);

            // Convert a rule to group
            convertRuleToGroup(tree, 'd1', 'g1', FilterGroupOperator.or);

            // Add another rule to that group
            const d3 = createDimensionRule('d3');
            addFilterRuleToTree(tree, 'g1', 'dimensions', d3);

            // Update a rule
            updateFilterRule(
                tree,
                'm1',
                {
                    operator: FilterOperator.GREATER_THAN,
                },
                'metrics',
            );

            // Move a rule
            moveNode(tree, 'd2', 'g1');

            assertTreeValid(tree);

            const g1 = tree.byId.g1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(g1.childIds).toContain('d1');
            expect(g1.childIds).toContain('d2');
            expect(g1.childIds).toContain('d3');
        });

        it('should normalize, modify, denormalize and verify correctness', () => {
            const originalFilters: Filters = {
                dimensions: {
                    id: 'or1',
                    or: [createDimensionRule('d1'), createDimensionRule('d2')],
                },
                metrics: {
                    id: 'and1',
                    and: [createMetricRule('m1')],
                },
            };

            const tree = normalizeFilters(originalFilters);

            // Add a new dimension rule
            const d3 = createDimensionRule('d3');
            addFilterRuleToTree(tree, 'or1', 'dimensions', d3);

            // Update metric rule
            updateFilterRule(tree, 'm1', { values: [999] }, 'metrics');

            const result = denormalizeFilters(tree);

            // Verify dimensions OR group has 3 rules
            const dimGroup = result.dimensions;
            expect(
                dimGroup && 'or' in dimGroup ? dimGroup.or : [],
            ).toHaveLength(3);

            // Verify metric was updated
            const metricGroup = result.metrics;
            const metricRules = (
                metricGroup && 'and' in metricGroup ? metricGroup.and : []
            ) as FilterRule[];
            expect(metricRules[0]?.values).toEqual([999]);
        });

        it('should handle multiple operator changes with deduplication', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [
                                {
                                    id: 'and2',
                                    and: [createDimensionRule('r1')],
                                },
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);

            // Change and2 to OR - should merge with or1
            setGroupOperator(tree, 'and2', FilterGroupOperator.or);

            assertTreeValid(tree);
            expect(tree.byId.and2).toBeUndefined();

            const or1 = tree.byId.or1 as Extract<
                FilterTreeNode,
                { type: 'group' }
            >;
            expect(or1.childIds).toContain('r1');
        });

        it('should handle deep nesting (5+ levels) with all operations', () => {
            // Create 5-level structure
            const filters: Filters = {
                dimensions: {
                    id: 'level1',
                    and: [
                        {
                            id: 'level2',
                            or: [
                                {
                                    id: 'level3',
                                    and: [
                                        {
                                            id: 'level4',
                                            or: [
                                                {
                                                    id: 'level5',
                                                    and: [
                                                        createDimensionRule(
                                                            'r1',
                                                        ),
                                                    ],
                                                },
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            };

            const tree = normalizeFilters(filters);

            // Add rule at deepest level
            const r2 = createDimensionRule('r2');
            addFilterRuleToTree(tree, 'level5', 'dimensions', r2);

            // Update rule
            updateFilterRule(
                tree,
                'r1',
                {
                    operator: FilterOperator.NOT_EQUALS,
                },
                'dimensions',
            );

            // Remove a rule
            removeNodeFromTree(tree, 'r2');

            // Move a group
            moveNode(tree, 'level5', 'level2');

            assertTreeValid(tree);

            // Verify structure still valid
            expect(tree.byId.level5?.parentId).toBe('level2');
        });
    });

    describe('round-trip with mutations', () => {
        it('should preserve equality after normalize → add rules → denormalize → normalize', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    and: [createDimensionRule('d1')],
                },
            };

            const tree1 = normalizeFilters(filters);

            // Add a rule
            const d2 = createDimensionRule('d2');
            addFilterRuleToTree(tree1, tree1.rootId, 'dimensions', d2);

            const denormalized = denormalizeFilters(tree1);
            const tree2 = normalizeFilters(denormalized);

            // Trees should have same structure
            expect(tree2.byId.d1).toBeDefined();
            expect(tree2.byId.d2).toBeDefined();
        });

        it('should preserve equality after normalize → remove → denormalize → normalize', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    and: [createDimensionRule('d1'), createDimensionRule('d2')],
                },
            };

            const tree1 = normalizeFilters(filters);
            removeNodeFromTree(tree1, 'd2');

            const denormalized = denormalizeFilters(tree1);
            const tree2 = normalizeFilters(denormalized);

            expect(tree2.byId.d1).toBeDefined();
            expect(tree2.byId.d2).toBeUndefined();
        });

        it('should preserve equality after normalize → change operators → denormalize → normalize', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'and1',
                    and: [
                        {
                            id: 'or1',
                            or: [createDimensionRule('r1')],
                        },
                    ],
                },
            };

            const tree1 = normalizeFilters(filters);
            setGroupOperator(tree1, 'or1', FilterGroupOperator.and);

            const denormalized = denormalizeFilters(tree1);
            const tree2 = normalizeFilters(denormalized);

            assertTreeValid(tree2);
            expect(tree2.byId.r1).toBeDefined();
        });
    });

    describe('immutability with immer', () => {
        it('should work correctly with immer draft state', () => {
            const tree = createEmptyFilterTree();
            const rule = createDimensionRule('r1');

            const newTree = produce(tree, (draft) => {
                addFilterRuleToTree(draft, draft.rootId, 'dimensions', rule);
            });

            // Original tree unchanged
            expect(tree.byId.r1).toBeUndefined();

            // New tree has the rule
            expect(newTree.byId.r1).toBeDefined();
            assertTreeValid(newTree);
        });

        it('should preserve original tree when using immer produce', () => {
            const filters: Filters = {
                dimensions: {
                    id: 'g1',
                    and: [createDimensionRule('d1'), createDimensionRule('d2')],
                },
            };

            const tree = normalizeFilters(filters);
            const originalJson = JSON.stringify(tree);

            const newTree = produce(tree, (draft) => {
                removeNodeFromTree(draft, 'd2');
            });

            // Original unchanged
            expect(JSON.stringify(tree)).toBe(originalJson);

            // New tree modified
            expect(newTree.byId.d2).toBeUndefined();
            expect(tree.byId.d2).toBeDefined();
        });
    });
});
