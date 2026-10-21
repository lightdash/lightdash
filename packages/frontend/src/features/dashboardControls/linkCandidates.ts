import {
    getItemId,
    type DashboardFieldTarget,
    type DashboardFilterableField,
    type DashboardFilterRule,
    type DashboardTile,
} from '@lightdash/common';
import { getFieldCandidates } from './fieldCandidates';
import {
    doesTileOfferField,
    getFilterFields,
    canTileTakeFilter,
    type FieldsByTile,
} from './peers';

const toTarget = (
    fieldId: string,
    tableName: string,
): DashboardFieldTarget => ({
    fieldId,
    tableName,
});

// Fields of a new tile a filter could use: its other fields first (a field
// left by a deleted tile is not one), else any of exactly the target's type
export const getLinkCandidates = (
    rule: DashboardFilterRule,
    tile: DashboardTile,
    tiles: DashboardTile[] | undefined,
    fieldsByTile: FieldsByTile,
    fieldsMap: Record<string, DashboardFilterableField>,
): DashboardFieldTarget[] => {
    // A SQL column is not a field: it matches no field of a chart tile
    if (rule.target.isSqlColumn) return [];
    if (!canTileTakeFilter(tile, fieldsByTile)) return [];
    if (rule.tileTargets?.[tile.uuid] !== undefined) return [];
    if (doesTileOfferField(tile, rule.target.fieldId, fieldsByTile)) return [];

    const tileFields = fieldsByTile?.[tile.uuid] ?? [];
    const peerIds = new Set(getFilterFields(rule, tiles));
    const peers = tileFields.filter((field) => peerIds.has(getItemId(field)));
    if (peers.length > 0) {
        return dedupe(peers.map((f) => toTarget(getItemId(f), f.table)));
    }

    const targetField = fieldsMap[rule.target.fieldId];
    if (!targetField) return [];
    return dedupe(
        getFieldCandidates(tileFields, [], targetField).map((f) =>
            toTarget(getItemId(f), f.table),
        ),
    );
};

const dedupe = (targets: DashboardFieldTarget[]): DashboardFieldTarget[] =>
    targets.filter(
        (target, index) =>
            targets.findIndex((t) => t.fieldId === target.fieldId) === index,
    );

export const getLinkKey = (tileUuid: string, ruleId: string): string =>
    `${tileUuid}|${ruleId}`;
