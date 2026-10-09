import {
    getItemId,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type DimensionType,
} from '@lightdash/common';
import { getFilterTileRelation } from '../dashboardFilters/FilterConfiguration/utils';

export type FieldsByTile =
    | Record<string, DashboardFilterableField[]>
    | undefined;

export type SqlColumn = { reference: string; type: DimensionType };
// SQL chart tiles keyed by uuid, each with every column it has.
export type SqlColumnsByTile = Record<string, SqlColumn[]>;

const isSqlTile = (tile: DashboardTile, sqlColumnsByTile: SqlColumnsByTile) =>
    (sqlColumnsByTile[tile.uuid]?.length ?? 0) > 0;

export type TabCount = { applied: number; total: number };

const doesTileOfferField = (
    tile: DashboardTile,
    fieldId: string,
    fieldsByTile: FieldsByTile,
): boolean =>
    fieldsByTile?.[tile.uuid]?.some((field) => getItemId(field) === fieldId) ??
    false;

// A data app tile takes the filter as a whole, with no field to choose
export const canTileTakeFilter = (
    tile: DashboardTile,
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile = {},
): boolean =>
    isDashboardDataAppTileType(tile) ||
    fieldsByTile?.[tile.uuid] !== undefined ||
    isSqlTile(tile, sqlColumnsByTile);

// Mirrors the shipped "auto" relation, data app tiles included.
export const getDefaultTileField = (
    rule: DashboardFilterRule,
    tile: DashboardTile,
    fieldsByTile: FieldsByTile,
): DashboardFieldTarget | null =>
    isDashboardDataAppTileType(tile) ||
    doesTileOfferField(tile, rule.target.fieldId, fieldsByTile)
        ? rule.target
        : null;

// A SQL tile is only ever mapped explicitly; auto means not filtered.
export const getTileField = (
    rule: DashboardFilterRule,
    tile: DashboardTile,
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile = {},
): DashboardFieldTarget | null => {
    const { relation, tileConfig } = getFilterTileRelation(rule, tile.uuid);
    if (relation === 'disabled') return null;
    if (relation === 'mapped' && isDashboardFieldTarget(tileConfig))
        return tileConfig;
    if (isSqlTile(tile, sqlColumnsByTile)) return null;
    return getDefaultTileField(rule, tile, fieldsByTile);
};

// SQL column mappings are per tile and never fields of the filter
const getPeerTargets = (rule: DashboardFilterRule): DashboardFieldTarget[] =>
    Object.values(rule.tileTargets ?? {})
        .filter(isDashboardFieldTarget)
        .filter((target) => !target.isSqlColumn && target.fieldId !== '');

// A placeholder has an empty target, which is never a field
export const getFilterFields = (rule: DashboardFilterRule): string[] => [
    ...new Set(
        [
            rule.target.fieldId,
            ...getPeerTargets(rule).map((target) => target.fieldId),
        ].filter((fieldId) => fieldId !== ''),
    ),
];

export const getTabCounts = (
    rule: DashboardFilterRule,
    tiles: DashboardTile[],
    tabs: DashboardTab[],
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile = {},
): Record<string, TabCount> =>
    Object.fromEntries(
        tabs.map((tab) => {
            const tabTiles = tiles.filter((tile) => tile.tabUuid === tab.uuid);
            return [
                tab.uuid,
                {
                    total: tabTiles.length,
                    applied: tabTiles.filter(
                        (tile) =>
                            getTileField(
                                rule,
                                tile,
                                fieldsByTile,
                                sqlColumnsByTile,
                            ) !== null,
                    ).length,
                },
            ];
        }),
    );
