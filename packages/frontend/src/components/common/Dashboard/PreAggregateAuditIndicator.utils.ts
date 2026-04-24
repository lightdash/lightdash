import {
    preAggregateMissReasonLabels,
    type PreAggregateMatchMiss,
} from '@lightdash/common';
import { type TilePreAggregateStatus } from '../../../providers/Dashboard/types';

export function formatTileMissReason(reason: PreAggregateMatchMiss): string {
    const label = preAggregateMissReasonLabels[reason.reason] ?? reason.reason;
    return 'fieldId' in reason && reason.fieldId
        ? `${label}: ${reason.fieldId}`
        : label;
}

export function getDetail(tile: TilePreAggregateStatus): string {
    if (tile.hit && tile.preAggregateName) {
        return tile.preAggregateName;
    }
    if (!tile.hit && tile.reason) {
        return formatTileMissReason(tile.reason);
    }
    return '—';
}
