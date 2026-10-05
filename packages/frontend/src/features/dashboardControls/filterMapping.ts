import {
    getAvailableDashboardFilterTarget,
    isDashboardFieldTarget,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTileTargets,
} from '@lightdash/common';
import { type ControlTileKind } from './tiles';

// What a tile offers a filter: the field ids of its chart, or its SQL columns
export type FilterTile = {
    tileUuid: string;
    kind: ControlTileKind;
    // null while the tile's fields or columns are not loaded
    fieldIds: string[] | null;
};

// Mappings are only safe to write once every chart tile's fields are loaded
export const hasUnknownFilterFields = (tiles: FilterTile[]): boolean =>
    tiles.some((tile) => tile.kind === 'chart' && tile.fieldIds === null);

export type FilterTileMapping =
    | { kind: 'mapped'; fieldId: string; isExplicit: boolean }
    | { kind: 'broken'; fieldId: string }
    | { kind: 'unmapped' };

type MappedRule = Pick<
    DashboardFilterRule,
    'target' | 'additionalTargets' | 'tileTargets'
>;

// A control being added has no field until its first mapping
export const hasFilterField = (rule: Pick<DashboardFilterRule, 'target'>) =>
    rule.target.fieldId !== '';

const isSameTarget = (a: DashboardFieldTarget, b: DashboardFieldTarget) =>
    a.fieldId === b.fieldId && !!a.isSqlColumn === !!b.isSqlColumn;

const tileHasTarget = (tile: FilterTile, target: DashboardFieldTarget) =>
    (tile.kind === 'sql') === !!target.isSqlColumn &&
    (tile.fieldIds ?? []).includes(target.fieldId);

// The fields a filter is mapped to, its own first
export const getFilterTargets = (rule: MappedRule): DashboardFieldTarget[] =>
    hasFilterField(rule)
        ? [rule.target, ...(rule.additionalTargets ?? [])]
        : [];

// The field a tile with no entry of its own applies the filter through
const getImplicitTarget = (
    rule: MappedRule,
    tile: FilterTile,
): DashboardFieldTarget | undefined =>
    tile.kind === 'chart'
        ? getAvailableDashboardFilterTarget(rule, tile.fieldIds ?? [])
        : undefined;

export const getFilterTileMapping = (
    rule: MappedRule,
    tile: FilterTile,
): FilterTileMapping => {
    const entry = rule.tileTargets?.[tile.tileUuid];
    if (entry === false) return { kind: 'unmapped' };
    // Data app tiles have no field: they take the filter unless switched off
    if (tile.kind === 'dataApp') {
        return { kind: 'mapped', fieldId: '', isExplicit: false };
    }
    if (!hasFilterField(rule)) return { kind: 'unmapped' };
    if (isDashboardFieldTarget(entry)) {
        // A saved field cannot be called missing before the tile's fields load
        return tile.fieldIds === null || tileHasTarget(tile, entry)
            ? { kind: 'mapped', fieldId: entry.fieldId, isExplicit: true }
            : { kind: 'broken', fieldId: entry.fieldId };
    }
    const implicit = getImplicitTarget(rule, tile);
    return implicit
        ? { kind: 'mapped', fieldId: implicit.fieldId, isExplicit: false }
        : { kind: 'unmapped' };
};

const withoutTile = (
    tileTargets: DashboardTileTargets,
    tileUuid: string,
): DashboardTileTargets => {
    const { [tileUuid]: _removed, ...rest } = tileTargets;
    return rest;
};

const withAdditionalTargets = <T extends MappedRule>(
    rule: T,
    additionalTargets: DashboardFieldTarget[],
): T => {
    const { additionalTargets: _previous, ...rest } = rule;
    return (
        additionalTargets.length > 0 ? { ...rest, additionalTargets } : rest
    ) as T;
};

// Drops fields no tile is mapped through, and the "off" entries they left behind
const pruneFilterTargets = <T extends MappedRule>(
    rule: T,
    tiles: FilterTile[],
): T => {
    if (hasUnknownFilterFields(tiles)) return rule;
    const usedFieldIds = new Set(
        tiles.flatMap((tile) => {
            if (tile.kind === 'dataApp') return [];
            const mapping = getFilterTileMapping(rule, tile);
            return mapping.kind === 'unmapped' ? [] : [mapping.fieldId];
        }),
    );
    const usedTargets = getFilterTargets(rule).filter((target) =>
        usedFieldIds.has(target.fieldId),
    );
    // A filter nothing is mapped through keeps its field
    if (usedTargets.length === 0) return rule;

    const [target, ...additionalTargets] = usedTargets;
    const pruned = withAdditionalTargets(
        { ...rule, target },
        additionalTargets,
    );
    const tileTargets = Object.fromEntries(
        Object.entries(rule.tileTargets ?? {}).filter(([tileUuid, entry]) => {
            if (entry !== false) return true;
            const tile = tiles.find((t) => t.tileUuid === tileUuid);
            // Unknown tiles keep their entry; known ones only while a field could apply
            return (
                !tile ||
                tile.fieldIds === null ||
                tile.kind === 'dataApp' ||
                getFilterTargets(pruned).some((t) => tileHasTarget(tile, t))
            );
        }),
    );
    return { ...pruned, tileTargets };
};

// A filter's first mapping: the field becomes its own, on this tile only
export const getFirstMappingTargets = (
    tileUuid: string,
    target: DashboardFieldTarget,
    tiles: FilterTile[],
): DashboardTileTargets => {
    const tile = tiles.find((t) => t.tileUuid === tileUuid);
    const off = Object.fromEntries(
        tiles
            .filter(
                (other) =>
                    other.tileUuid !== tileUuid && tileHasTarget(other, target),
            )
            .map((other) => [other.tileUuid, false as const]),
    );
    return tile?.kind === 'chart' ? off : { ...off, [tileUuid]: target };
};

// Data app tiles the author switched off, kept across the first mapping
const getSwitchedOffDataApps = (
    rule: MappedRule,
    tiles: FilterTile[],
): DashboardTileTargets =>
    Object.fromEntries(
        tiles
            .filter(
                (tile) =>
                    tile.kind === 'dataApp' &&
                    rule.tileTargets?.[tile.tileUuid] === false,
            )
            .map((tile) => [tile.tileUuid, false as const]),
    );

// Maps one tile to a field. A field new to the filter is added to its fields,
// and every other tile that has it and was not mapped is saved as off.
// The first mapping of a filter with no field makes the field its own.
export const mapFilterTile = <T extends MappedRule>(
    rule: T,
    tileUuid: string,
    target: DashboardFieldTarget,
    tiles: FilterTile[],
): T => {
    if (hasUnknownFilterFields(tiles)) return rule;
    const tile = tiles.find((t) => t.tileUuid === tileUuid);
    // Data app tiles have no field: switching one on drops its off entry
    if (tile?.kind === 'dataApp') {
        return {
            ...rule,
            tileTargets: withoutTile(rule.tileTargets ?? {}, tileUuid),
        };
    }
    if (!hasFilterField(rule)) {
        return {
            ...withAdditionalTargets(rule, []),
            target,
            tileTargets: {
                ...getSwitchedOffDataApps(rule, tiles),
                ...getFirstMappingTargets(tileUuid, target, tiles),
            },
        };
    }
    const isKnown = getFilterTargets(rule).some((t) => isSameTarget(t, target));

    const offForOthers: DashboardTileTargets = isKnown
        ? {}
        : Object.fromEntries(
              tiles
                  .filter(
                      (other) =>
                          other.tileUuid !== tileUuid &&
                          other.kind === 'chart' &&
                          rule.tileTargets?.[other.tileUuid] === undefined &&
                          tileHasTarget(other, target) &&
                          getFilterTileMapping(rule, other).kind === 'unmapped',
                  )
                  .map((other) => [other.tileUuid, false as const]),
          );

    const isOwnField =
        isSameTarget(rule.target, target) && tile?.kind === 'chart';
    const tileTargets = {
        ...(rule.tileTargets ?? {}),
        ...offForOthers,
    };
    const next = withAdditionalTargets(
        {
            ...rule,
            tileTargets: isOwnField
                ? withoutTile(tileTargets, tileUuid)
                : { ...tileTargets, [tileUuid]: target },
        },
        isKnown || target.isSqlColumn
            ? (rule.additionalTargets ?? [])
            : [...(rule.additionalTargets ?? []), target],
    );
    return pruneFilterTargets(next, tiles);
};

// Takes one tile out: off when its chart has a mapped field, otherwise no entry
export const unmapFilterTile = <T extends MappedRule>(
    rule: T,
    tileUuid: string,
    tiles: FilterTile[],
): T => {
    if (hasUnknownFilterFields(tiles)) return rule;
    const tile = tiles.find((t) => t.tileUuid === tileUuid);
    const hasMappedField =
        !!tile &&
        (tile.kind === 'dataApp' ||
            getFilterTargets(rule).some((target) =>
                tileHasTarget(tile, target),
            ));
    const tileTargets = rule.tileTargets ?? {};
    return pruneFilterTargets(
        {
            ...rule,
            tileTargets: hasMappedField
                ? { ...tileTargets, [tileUuid]: false }
                : withoutTile(tileTargets, tileUuid),
        },
        tiles,
    );
};

const mapFilterTiles = <T extends MappedRule>(
    rule: T,
    tileUuids: string[],
    target: DashboardFieldTarget,
    tiles: FilterTile[],
): T =>
    tileUuids.reduce(
        (acc, tileUuid) => mapFilterTile(acc, tileUuid, target, tiles),
        rule,
    );

const unmapFilterTiles = <T extends MappedRule>(
    rule: T,
    tileUuids: string[],
    tiles: FilterTile[],
): T =>
    tileUuids.reduce(
        (acc, tileUuid) => unmapFilterTile(acc, tileUuid, tiles),
        rule,
    );

// Maps every tile that has the field and is not mapped to anything.
// Tiles mapped to another field are left alone.
export const addFilterField = <T extends MappedRule>(
    rule: T,
    target: DashboardFieldTarget,
    tiles: FilterTile[],
): T => {
    if (hasUnknownFilterFields(tiles)) return rule;
    const tileUuids = tiles
        .filter(
            (tile) =>
                tile.kind === 'chart' &&
                tileHasTarget(tile, target) &&
                getFilterTileMapping(rule, tile).kind === 'unmapped',
        )
        .map((tile) => tile.tileUuid);
    return mapFilterTiles(rule, tileUuids, target, tiles);
};

// Takes out every tile mapped through the field. Data app tiles have no
// field, so they stay as they are.
export const removeFilterField = <T extends MappedRule>(
    rule: T,
    target: DashboardFieldTarget,
    tiles: FilterTile[],
): T => {
    if (hasUnknownFilterFields(tiles)) return rule;
    const tileUuids = tiles
        .filter((tile) => {
            if (tile.kind === 'dataApp') return false;
            const mapping = getFilterTileMapping(rule, tile);
            return (
                mapping.kind !== 'unmapped' &&
                (tile.kind === 'sql') === !!target.isSqlColumn &&
                mapping.fieldId === target.fieldId
            );
        })
        .map((tile) => tile.tileUuid);
    return unmapFilterTiles(rule, tileUuids, tiles);
};
