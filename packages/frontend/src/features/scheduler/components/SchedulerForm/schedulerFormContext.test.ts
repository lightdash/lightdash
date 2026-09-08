import { SchedulerFormat, ThresholdOperator } from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    DEFAULT_VALUES,
    DEFAULT_VALUES_ALERT,
    transformFormValues,
} from './schedulerFormContext';

describe('transformFormValues', () => {
    test('keeps the csv attachment on when the only recipient is a Slack channel', () => {
        const result = transformFormValues(
            {
                ...DEFAULT_VALUES,
                format: SchedulerFormat.CSV,
                options: { ...DEFAULT_VALUES.options, asAttachment: true },
                emailTargets: [],
                slackTargets: ['C123'],
            },
            'chart',
        );

        expect(result.options).toMatchObject({ asAttachment: true });
    });

    test('forces the csv attachment off when there is nobody to attach it for', () => {
        const result = transformFormValues(
            {
                ...DEFAULT_VALUES,
                format: SchedulerFormat.CSV,
                options: { ...DEFAULT_VALUES.options, asAttachment: true },
                emailTargets: [],
                slackTargets: [],
            },
            'chart',
        );

        expect(result.options).toMatchObject({ asAttachment: false });
    });

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
