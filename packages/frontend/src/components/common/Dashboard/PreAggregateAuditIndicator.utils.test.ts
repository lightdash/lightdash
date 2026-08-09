import {
    PreAggregateMissReason,
    type PreAggregateMatchMiss,
} from '@lightdash/common';
import { formatTileMissReason } from './PreAggregateAuditIndicator.utils';

const missingRequiredFilterDimension = {
    reason: PreAggregateMissReason.REQUIRED_FILTER_DIMENSION_NOT_IN_PRE_AGGREGATE,
    fieldId: 'orders_status',
} satisfies PreAggregateMatchMiss;

describe('formatTileMissReason', () => {
    it('explains how to make a required-filter dimension available', () => {
        expect(
            formatTileMissReason(
                missingRequiredFilterDimension,
                'Order status',
            ),
        ).toBe(
            'Required filter dimension not in pre-aggregate: Order status — add this field to the pre-aggregate dimensions',
        );
    });

    it('falls back to the field ID when its label is unavailable', () => {
        expect(formatTileMissReason(missingRequiredFilterDimension)).toBe(
            'Required filter dimension not in pre-aggregate: orders_status — add this field to the pre-aggregate dimensions',
        );
    });
});
