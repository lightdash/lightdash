import {
    getFilterTypeFromItemType,
    getItemId,
    isDashboardDataAppTileType,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
    type DimensionType,
    type FilterType,
} from '@lightdash/common';
import { getFilterTileRelation } from '../dashboardFilters/FilterConfiguration/utils';

export type FieldsByTile =
    | Record<string, DashboardFilterableField[]>
    | undefined;

export type SqlColumn = { reference: string; type: DimensionType };
// SQL chart tiles keyed by uuid, each with the columns of the filter's kind.
export type SqlColumnsByTile = Record<string, SqlColumn[]>;

const SQL_COLUMN_TABLE = 'mock_table';

export const getSqlColumnsOfKind = (
    columns: SqlColumn[],
    kind: FilterType,
): SqlColumn[] =>
    columns.filter((column) => getFilterTypeFromItemType(column.type) === kind);

export const toSqlColumnTarget = (reference: string): DashboardFieldTarget => ({
    fieldId: reference,
    tableName: SQL_COLUMN_TABLE,
    isSqlColumn: true,
});

const isSqlTile = (tile: DashboardTile, sqlColumnsByTile: SqlColumnsByTile) =>
    (sqlColumnsByTile[tile.uuid]?.length ?? 0) > 0;

export type FieldCount = { applied: number; possible: number };
export type TabCount = { applied: number; total: number };

export const doesTileOfferField = (
    tile: DashboardTile,
    fieldId: string,
    fieldsByTile: FieldsByTile,
): boolean =>
    fieldsByTile?.[tile.uuid]?.some((field) => getItemId(field) === fieldId) ??
    false;

export const isTileFilterable = (
    tile: DashboardTile,
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile = {},
): boolean =>
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

export const isTileChanged = (
    rule: DashboardFilterRule,
    tile: DashboardTile,
    fieldsByTile: FieldsByTile,
): boolean => {
    if (rule.tileTargets?.[tile.uuid] === undefined) return false;
    const current = getTileField(rule, tile, fieldsByTile);
    const fallback = getDefaultTileField(rule, tile, fieldsByTile);
    return (current?.fieldId ?? null) !== (fallback?.fieldId ?? null);
};

// SQL column mappings are per tile and never fields of the filter
const getPeerTargets = (rule: DashboardFilterRule): DashboardFieldTarget[] =>
    Object.values(rule.tileTargets ?? {})
        .filter(isDashboardFieldTarget)
        .filter((target) => !target.isSqlColumn && target.fieldId !== '');

// An unplaced filter has an empty target, which is never a field
export const getFilterFields = (
    rule: DashboardFilterRule,
    listedFieldIds: string[],
): string[] => [
    ...new Set(
        [
            rule.target.fieldId,
            ...getPeerTargets(rule).map((target) => target.fieldId),
            ...listedFieldIds,
        ].filter((fieldId) => fieldId !== ''),
    ),
];

export const getFieldCount = (
    rule: DashboardFilterRule,
    fieldId: string,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile = {},
): FieldCount => ({
    // A SQL tile is reached through one of its own columns, never a field
    possible: tiles.filter((tile) =>
        doesTileOfferField(tile, fieldId, fieldsByTile),
    ).length,
    applied: tiles.filter(
        (tile) =>
            getTileField(rule, tile, fieldsByTile, sqlColumnsByTile)
                ?.fieldId === fieldId,
    ).length,
});

const withTileTargets = (
    rule: DashboardFilterRule,
    tileTargets: NonNullable<DashboardFilterRule['tileTargets']>,
): DashboardFilterRule => {
    const rest = Object.fromEntries(
        Object.entries(rule).filter(([key]) => key !== 'tileTargets'),
    ) as Omit<DashboardFilterRule, 'tileTargets'>;
    return Object.keys(tileTargets).length > 0
        ? { ...rest, tileTargets }
        : rest;
};

export const setTileField = (
    rule: DashboardFilterRule,
    tile: DashboardTile,
    field: DashboardFieldTarget | null,
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile = {},
): DashboardFilterRule => {
    const fallback = isSqlTile(tile, sqlColumnsByTile)
        ? null
        : getDefaultTileField(rule, tile, fieldsByTile);
    const others = Object.fromEntries(
        Object.entries(rule.tileTargets ?? {}).filter(
            ([tileUuid]) => tileUuid !== tile.uuid,
        ),
    );
    if ((field?.fieldId ?? null) === (fallback?.fieldId ?? null)) {
        return withTileTargets(rule, others);
    }
    return withTileTargets(rule, { ...others, [tile.uuid]: field ?? false });
};

export const applyFieldToAll = (
    rule: DashboardFilterRule,
    field: DashboardFieldTarget,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
): DashboardFilterRule =>
    tiles
        .filter((tile) => doesTileOfferField(tile, field.fieldId, fieldsByTile))
        .reduce(
            (next, tile) => setTileField(next, tile, field, fieldsByTile),
            rule,
        );

// Maps the field onto every tile that offers it and this filter does not
// reach yet; tiles already filtered by another field keep that field
export const applyFieldToUnfilteredTiles = (
    rule: DashboardFilterRule,
    field: DashboardFieldTarget,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
    sqlColumnsByTile: SqlColumnsByTile = {},
): DashboardFilterRule =>
    tiles
        .filter(
            (tile) =>
                doesTileOfferField(tile, field.fieldId, fieldsByTile) &&
                getTileField(rule, tile, fieldsByTile, sqlColumnsByTile) ===
                    null,
        )
        .reduce(
            (next, tile) => setTileField(next, tile, field, fieldsByTile),
            rule,
        );

export const removeFieldFromAll = (
    rule: DashboardFilterRule,
    fieldId: string,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
): DashboardFilterRule =>
    tiles
        .filter(
            (tile) =>
                getTileField(rule, tile, fieldsByTile)?.fieldId === fieldId,
        )
        .reduce(
            (next, tile) => setTileField(next, tile, null, fieldsByTile),
            rule,
        );

export const removeField = (
    rule: DashboardFilterRule,
    fieldId: string,
    tiles: DashboardTile[],
    fieldsByTile: FieldsByTile,
): DashboardFilterRule => {
    if (fieldId !== rule.target.fieldId) {
        const kept = Object.fromEntries(
            Object.entries(rule.tileTargets ?? {}).filter(
                ([, entry]) =>
                    !(
                        isDashboardFieldTarget(entry) &&
                        entry.fieldId === fieldId
                    ),
            ),
        );
        return withTileTargets(rule, kept);
    }

    const promoted = getPeerTargets(rule).find(
        (target) => target.fieldId !== fieldId,
    );
    if (promoted === undefined) return rule;

    const base: DashboardFilterRule = withTileTargets(
        { ...rule, target: promoted },
        {},
    );
    return tiles.reduce((next, tile) => {
        const effective = getTileField(rule, tile, fieldsByTile);
        if (effective?.fieldId === fieldId) {
            return setTileField(next, tile, null, fieldsByTile);
        }
        return setTileField(next, tile, effective, fieldsByTile);
    }, base);
};

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

// Per tab: how many tiles the given field is on, out of every tile on the tab.
export const getTabCountsForField = (
    rule: DashboardFilterRule,
    fieldId: string,
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
                            )?.fieldId === fieldId,
                    ).length,
                },
            ];
        }),
    );
