import {
    DashboardTileTypes,
    FilterOperator,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { doesFilterRequirementApplyToTiles } from './utils';

const createRule = (
    overrides: Partial<DashboardFilterRule> & { id: string },
): DashboardFilterRule => ({
    target: { fieldId: 'customers_first_name', tableName: 'customers' },
    operator: FilterOperator.EQUALS,
    values: [],
    disabled: true,
    label: undefined,
    ...overrides,
});

const createTile = (uuid: string): DashboardTile =>
    ({
        uuid,
        type: DashboardTileTypes.SAVED_CHART,
        properties: { savedChartUuid: `chart-${uuid}` },
    }) as DashboardTile;

const firstNameField = {
    name: 'first_name',
    table: 'customers',
} as DashboardFilterableField;
const fieldsByTileUuid = {
    'tile-a': [firstNameField],
    'tile-b': [firstNameField],
};
const tabA = [createTile('tile-a')];
const tabB = [createTile('tile-b')];

describe('doesFilterRequirementApplyToTiles', () => {
    it('applies everywhere without tile targets', () => {
        expect(
            doesFilterRequirementApplyToTiles(
                [createRule({ id: 'a' })],
                [],
                fieldsByTileUuid,
            ),
        ).toBe(true);
    });

    it('applies only where a targeted tile is', () => {
        const members = [
            createRule({ id: 'a', tileTargets: { 'tile-b': false } }),
        ];

        expect(
            doesFilterRequirementApplyToTiles(members, tabA, fieldsByTileUuid),
        ).toBe(true);
        expect(
            doesFilterRequirementApplyToTiles(members, tabB, fieldsByTileUuid),
        ).toBe(false);
    });

    it('applies when any member of a group reaches a tile', () => {
        const members = [
            createRule({ id: 'a', tileTargets: { 'tile-b': false } }),
            createRule({ id: 'b', tileTargets: { 'tile-a': false } }),
        ];

        expect(
            doesFilterRequirementApplyToTiles(members, tabB, fieldsByTileUuid),
        ).toBe(true);
    });
});
