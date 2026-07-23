import { ThresholdOperator } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    DEFAULT_VALUES_ALERT,
    transformFormValues,
} from './schedulerFormContext';

describe('transformFormValues', () => {
    test('omits blank threshold values from the API payload', () => {
        const result = transformFormValues(
            {
                ...DEFAULT_VALUES_ALERT,
                thresholds: [
                    {
                        fieldId: 'orders_total',
                        operator: ThresholdOperator.GREATER_THAN,
                        value: '',
                    },
                ],
            },
            'chart',
        );

        expect(result.thresholds).toEqual([]);
    });
});
