import {
    FilterOperator,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getSchedulerFilterRequirements } from './filterRequirements';

const rule = (
    overrides: Partial<DashboardFilterRule> & Pick<DashboardFilterRule, 'id'>,
): DashboardFilterRule => ({
    target: { fieldId: `field_${overrides.id}`, tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
    tileTargets: {},
    ...overrides,
});

const dashboardFilters = (
    dimensions: DashboardFilterRule[],
    metrics: DashboardFilterRule[] = [],
): DashboardFilters => ({ dimensions, metrics, tableCalculations: [] });

describe('getSchedulerFilterRequirements', () => {
    describe('flag off (main parity)', () => {
        it('flags required scheduler filters without values', () => {
            const required = rule({ id: 'a', required: true });
            const { filtersWithUnmetRequirements, unmetRequirements } =
                getSchedulerFilterRequirements(
                    dashboardFilters([required]),
                    [required],
                    false,
                );
            expect(filtersWithUnmetRequirements).toEqual([required]);
            expect(unmetRequirements).toEqual([
                { type: 'single', filter: required },
            ]);
        });

        it('does not flag required filters with values', () => {
            const filters = [
                rule({
                    id: 'a',
                    required: true,
                    values: ['x'],
                    disabled: false,
                }),
            ];
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters(filters),
                    filters,
                    false,
                ).filtersWithUnmetRequirements,
            ).toEqual([]);
        });

        it('ignores unmet groups', () => {
            const members = [
                rule({ id: 'a', requiredGroupId: 'g1' }),
                rule({ id: 'b', requiredGroupId: 'g1' }),
            ];
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters(members),
                    members,
                    false,
                ).filtersWithUnmetRequirements,
            ).toEqual([]);
        });

        it('evaluates scheduler filters only, ignoring the saved dashboard', () => {
            const required = rule({ id: 'a', required: true });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters([required]),
                    [],
                    false,
                ).filtersWithUnmetRequirements,
            ).toEqual([]);
        });
    });

    describe('flag on', () => {
        const groupMembers = [
            rule({ id: 'a', requiredGroupId: 'g1' }),
            rule({ id: 'b', requiredGroupId: 'g1' }),
        ];

        it('flags every member of a fully valueless group', () => {
            const { unmetRequirements, filtersWithUnmetRequirements } =
                getSchedulerFilterRequirements(
                    dashboardFilters(groupMembers),
                    [],
                    true,
                );
            expect(unmetRequirements).toEqual([
                { type: 'group', groupId: 'g1', filters: groupMembers },
            ]);
            expect(filtersWithUnmetRequirements.map((f) => f.id)).toEqual([
                'a',
                'b',
            ]);
        });

        it('is satisfied when an override provides a value for any member', () => {
            const override = rule({
                id: 'a',
                values: ['card'],
                disabled: false,
            });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters(groupMembers),
                    [override],
                    true,
                ).filtersWithUnmetRequirements,
            ).toEqual([]);
        });

        it('stays unmet for an enabled override with empty values', () => {
            const override = rule({ id: 'a', values: [], disabled: false });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters(groupMembers),
                    [override],
                    true,
                ).filtersWithUnmetRequirements,
            ).toHaveLength(2);
        });

        it('stays unmet when an override tries to strip the group id', () => {
            const override = rule({
                id: 'a',
                requiredGroupId: undefined,
                values: [],
                disabled: false,
            });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters(groupMembers),
                    [override],
                    true,
                ).filtersWithUnmetRequirements,
            ).toHaveLength(2);
        });

        it('is satisfied by a value-less operator on a member', () => {
            const override = rule({
                id: 'a',
                operator: FilterOperator.NULL,
                values: [],
                disabled: false,
            });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters(groupMembers),
                    [override],
                    true,
                ).filtersWithUnmetRequirements,
            ).toEqual([]);
        });

        it('flags unmet required singles from the saved dashboard even with no overrides', () => {
            const required = rule({ id: 'a', required: true });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters([required]),
                    [],
                    true,
                ).filtersWithUnmetRequirements.map((f) => f.id),
            ).toEqual(['a']);
        });

        it('does not flag required singles with a saved default value', () => {
            const required = rule({
                id: 'a',
                required: true,
                values: ['x'],
                disabled: false,
            });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters([required]),
                    [],
                    true,
                ).filtersWithUnmetRequirements,
            ).toEqual([]);
        });

        it('includes unmet requirements on saved metric filters', () => {
            const metric = rule({ id: 'm', required: true });
            expect(
                getSchedulerFilterRequirements(
                    dashboardFilters([], [metric]),
                    [],
                    true,
                ).filtersWithUnmetRequirements.map((f) => f.id),
            ).toEqual(['m']);
        });

        it('returns a rule once when it is both required and a group member', () => {
            const both = rule({
                id: 'a',
                required: true,
                requiredGroupId: 'g1',
            });
            const sibling = rule({ id: 'b', requiredGroupId: 'g1' });
            const { filtersWithUnmetRequirements } =
                getSchedulerFilterRequirements(
                    dashboardFilters([both, sibling]),
                    [],
                    true,
                );
            expect(
                filtersWithUnmetRequirements.filter((f) => f.id === 'a'),
            ).toHaveLength(1);
        });

        it('returns nothing without saved dashboard filters', () => {
            expect(
                getSchedulerFilterRequirements(undefined, [], true)
                    .filtersWithUnmetRequirements,
            ).toEqual([]);
        });
    });
});
