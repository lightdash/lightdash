import { assertUnreachable, DimensionType } from '@lightdash/common';
import type { TdcpLogicalType } from '@lightdash/tdcp';

/**
 * The protocol's logical types and the host's DimensionType are a deliberate
 * bijection in this revision — these two functions are the only place the
 * vocabularies meet, so when the spec moves to Arrow logical types the
 * migration is exactly here.
 */

export const tdcpTypeToDimensionType = (
    type: TdcpLogicalType,
): DimensionType => {
    switch (type) {
        case 'string':
            return DimensionType.STRING;
        case 'number':
            return DimensionType.NUMBER;
        case 'timestamp':
            return DimensionType.TIMESTAMP;
        case 'date':
            return DimensionType.DATE;
        case 'boolean':
            return DimensionType.BOOLEAN;
        default:
            return assertUnreachable(type, 'Unknown TDCP logical type');
    }
};

export const dimensionTypeToTdcpType = (
    type: DimensionType,
): TdcpLogicalType => {
    switch (type) {
        case DimensionType.STRING:
            return 'string';
        case DimensionType.NUMBER:
            return 'number';
        case DimensionType.TIMESTAMP:
            return 'timestamp';
        case DimensionType.DATE:
            return 'date';
        case DimensionType.BOOLEAN:
            return 'boolean';
        default:
            return assertUnreachable(type, 'Unknown dimension type');
    }
};
