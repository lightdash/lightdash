import { ThresholdOperator } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    DEFAULT_VALUES,
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

    test('keeps plain text on when the delivery has an email recipient', () => {
        const result = transformFormValues(
            {
                ...DEFAULT_VALUES,
                plainTextEmail: true,
                emailTargets: ['recipient@example.com'],
            },
            'dashboard',
        );

        expect(result.plainTextEmail).toBe(true);
    });

    test('forces plain text off when there is no email recipient to receive it', () => {
        const result = transformFormValues(
            {
                ...DEFAULT_VALUES,
                plainTextEmail: true,
                emailTargets: [],
                slackTargets: ['#analytics'],
            },
            'dashboard',
        );

        expect(result.plainTextEmail).toBe(false);
    });
});
