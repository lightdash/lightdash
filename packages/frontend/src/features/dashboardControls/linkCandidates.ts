import {
    getItemId,
    type DashboardFieldTarget,
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import { getFieldKind } from './fieldKinds';
import {
    doesTileOfferField,
    getFilterFields,
    isTileFilterable,
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
// the filter's peer fields first, else any field of the filter's kind.
export const getLinkCandidates = (
    rule: DashboardFilterRule,
    tile: DashboardTile,
    fieldsByTile: FieldsByTile,
    fieldsMap: Record<string, FilterableDimension>,
): DashboardFieldTarget[] => {
    if (!isTileFilterable(tile, fieldsByTile)) return [];
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
    const kind = getFieldKind(targetField);
    return dedupe(
        tileFields
            .filter((field) => getFieldKind(field) === kind)
            .map((f) => toTarget(getItemId(f), f.table)),
    );
};

const dedupe = (targets: DashboardFieldTarget[]): DashboardFieldTarget[] =>
    targets.filter(
        (target, index) =>
            targets.findIndex((t) => t.fieldId === target.fieldId) === index,
    );

export const getLinkKey = (tileUuid: string, ruleId: string): string =>
    `${tileUuid}|${ruleId}`;
