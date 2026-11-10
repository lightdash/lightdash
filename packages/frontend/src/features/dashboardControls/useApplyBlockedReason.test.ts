import {
    DEFAULT_UI_STRINGS,
    FilterOperator,
    type DashboardFilterRule,
    type UiStringKey,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getApplyBlockedReason } from './useApplyBlockedReason';

const getUiString = (key: UiStringKey) => DEFAULT_UI_STRINGS[key];

const rule = (
    id: string,
    overrides: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: `orders_${id}`, tableName: 'orders' },
    values: [],
    ...overrides,
});

const reasonFor = (
    edited: DashboardFilterRule,
    {
        isViewer,
        others = [],
        appliedTileCount = 3,
    }: {
        isViewer: boolean;
        others?: DashboardFilterRule[];
        appliedTileCount?: number;
    },
) =>
    getApplyBlockedReason({
        rule: edited,
        filters: {
            dimensions: [edited, ...others],
            metrics: [],
            tableCalculations: [],
        },
        appliedTileCount,
        isViewer,
        getUiString,
    });

const REQUIRED = DEFAULT_UI_STRINGS['filters.config.applyRequiredTooltip'];

describe('getApplyBlockedReason', () => {
    describe('for an editor', () => {
        it('lets a required filter with no value apply: viewers set it', () => {
            expect(
                reasonFor(rule('a', { required: true, disabled: true }), {
                    isViewer: false,
                }),
            ).toBeNull();
        });

        it('lets a member of a required group with no value apply', () => {
            expect(
                reasonFor(rule('a', { requiredGroupId: 'g', disabled: true }), {
                    isViewer: false,
                    others: [
                        rule('b', { requiredGroupId: 'g', disabled: true }),
                    ],
                }),
            ).toBeNull();
        });

        it('blocks a filter that reaches no tile', () => {
            expect(
                reasonFor(rule('a', { values: ['x'] }), {
                    isViewer: false,
                    appliedTileCount: 0,
                }),
            ).toBe(DEFAULT_UI_STRINGS['filters.notAppliedToAnyTiles']);
        });

        it('blocks a locked, required filter with no value: no viewer could set it', () => {
            expect(
                reasonFor(
                    rule('a', {
                        required: true,
                        disabled: true,
                        lockedTabUuids: ['tab-1'],
                    }),
                    { isViewer: false },
                ),
            ).toBe(
                DEFAULT_UI_STRINGS['filters.config.applyLockedRequiredTooltip'],
            );
        });
    });

    describe('for a viewer', () => {
        // As the viewer's edit writes it: a required filter stays on
        it('blocks a required filter they cleared', () => {
            expect(
                reasonFor(rule('a', { required: true, disabled: false }), {
                    isViewer: true,
                }),
            ).toBe(REQUIRED);
        });

        // As it was saved: off, with no value
        it('lets an untouched required filter saved with no value apply: nothing was cleared', () => {
            expect(
                reasonFor(rule('a', { required: true, disabled: true }), {
                    isViewer: true,
                }),
            ).toBeNull();
        });

        it('lets an untouched member of a group saved with no value apply', () => {
            expect(
                reasonFor(rule('a', { requiredGroupId: 'g', disabled: true }), {
                    isViewer: true,
                    others: [
                        rule('b', { requiredGroupId: 'g', disabled: true }),
                    ],
                }),
            ).toBeNull();
        });

        it('lets a member of a group another member satisfies apply', () => {
            expect(
                reasonFor(rule('a', { requiredGroupId: 'g' }), {
                    isViewer: true,
                    others: [
                        rule('b', { requiredGroupId: 'g', values: ['x'] }),
                    ],
                }),
            ).toBeNull();
        });

        it('lets an unrequired filter they cleared apply as any value', () => {
            expect(
                reasonFor(rule('a', { disabled: true }), { isViewer: true }),
            ).toBeNull();
        });

        it('never blocks on tiles', () => {
            expect(
                reasonFor(rule('a', { values: ['x'] }), {
                    isViewer: true,
                    appliedTileCount: 0,
                }),
            ).toBeNull();
        });
    });
});
