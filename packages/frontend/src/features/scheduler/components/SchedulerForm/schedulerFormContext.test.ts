import {
    SchedulerFormat,
    ThresholdOperator,
    type AppQuerySelection,
    type AppScheduler,
    type SchedulerAndTargets,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    DEFAULT_VALUES,
    DEFAULT_VALUES_ALERT,
    getFormValuesFromScheduler,
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

    describe('app delivery payload', () => {
        const appState = { tab: 'overview' };
        const curatedSelections: AppQuerySelection[] = [
            {
                captureKey: 'v1:key-a',
                label: 'Revenue',
                exploreName: 'orders',
                excluded: true,
            },
            {
                captureKey: 'v1:key-b',
                label: 'Customers',
                exploreName: 'customers',
                excluded: false,
            },
        ];

        test('always carries an explicit appQuerySelections: null when never curated', () => {
            const result = transformFormValues(
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.CSV,
                    appState,
                    appQuerySelections: null,
                },
                'app',
            );

            // Explicit null, not an omitted key — the model clears on omission
            // and the form must always restate both app fields.
            expect('appQuerySelections' in result).toBe(true);
            expect(result.appQuerySelections).toBeNull();
            expect(result).toMatchObject({ appState });
        });

        test('carries the curated snapshot together with the app state', () => {
            const result = transformFormValues(
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.XLSX,
                    appState,
                    appQuerySelections: curatedSelections,
                },
                'app',
            );

            expect(result.appQuerySelections).toEqual(curatedSelections);
            expect(result).toMatchObject({ appState });
        });

        test('keeps the full snapshot when the user curated then re-included everything', () => {
            const allIncluded = curatedSelections.map((s) => ({
                ...s,
                excluded: false,
            }));
            const result = transformFormValues(
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.CSV,
                    appState,
                    appQuerySelections: allIncluded,
                },
                'app',
            );

            // They engaged — the snapshot persists so missing-query reporting
            // stays active. Never collapsed back to null.
            expect(result.appQuerySelections).toEqual(allIncluded);
        });

        test('sends null selections for image deliveries even when curated', () => {
            const result = transformFormValues(
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.IMAGE,
                    appState,
                    appQuerySelections: curatedSelections,
                },
                'app',
            );

            expect('appQuerySelections' in result).toBe(true);
            expect(result.appQuerySelections).toBeNull();
        });

        test('resends a curated saved scheduler verbatim when saved without opening the picker', () => {
            // End-to-end over the edit path: hydrate the form from the saved
            // scheduler, save untouched — the snapshot and state must survive.
            const curatedAppScheduler: SchedulerAndTargets = {
                schedulerUuid: 'scheduler-uuid',
                slug: 'app-delivery',
                name: 'App delivery',
                createdAt: new Date(),
                updatedAt: new Date(),
                createdBy: 'user-uuid',
                createdByName: 'User',
                format: SchedulerFormat.CSV,
                cron: '0 9 * * 1',
                savedChartUuid: null,
                savedChartName: null,
                dashboardUuid: null,
                dashboardName: null,
                savedSqlUuid: null,
                savedSqlName: null,
                appUuid: 'app-uuid',
                appName: 'App',
                appState,
                appQuerySelections: curatedSelections,
                options: { formatted: true, limit: 'table' },
                enabled: true,
                includeLinks: true,
                targets: [],
            } as AppScheduler & { targets: [] };

            const hydrated = getFormValuesFromScheduler(curatedAppScheduler);
            const result = transformFormValues(hydrated, 'app');

            expect(result.appQuerySelections).toEqual(curatedSelections);
            expect(result).toMatchObject({ appState });
        });

        test('never adds app fields to non-app payloads', () => {
            const result = transformFormValues(
                {
                    ...DEFAULT_VALUES,
                    format: SchedulerFormat.CSV,
                    appQuerySelections: curatedSelections,
                },
                'dashboard',
            );

            // The backend rejects appQuerySelections on non-app schedulers.
            expect('appQuerySelections' in result).toBe(false);
        });
    });
});
