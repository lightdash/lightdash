import {
    getItemId,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
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

// Fields of a newly added tile that a filter could reach but does not yet:
// the filter's peer fields first, else any field of exactly the target's
// type, the rule the tile dropdown and "Add another field" use.
export const getLinkCandidates = (
    rule: DashboardFilterRule,
    tile: DashboardTile,
    fieldsByTile: FieldsByTile,
    fieldsMap: Record<string, FilterableDimension>,
): DashboardFieldTarget[] => {
    if (!canTileTakeFilter(tile, fieldsByTile)) return [];
    if (rule.tileTargets?.[tile.uuid] !== undefined) return [];
    if (doesTileOfferField(tile, rule.target.fieldId, fieldsByTile)) return [];

    const tileFields = fieldsByTile?.[tile.uuid] ?? [];
    const peerIds = new Set(getFilterFields(rule));
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
