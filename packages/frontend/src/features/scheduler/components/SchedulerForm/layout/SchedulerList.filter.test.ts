import { SchedulerFormat, type SchedulerAndTargets } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { isDeliveryListScheduler } from './deliveryListFilter';

const scheduler = (
    overrides: Partial<SchedulerAndTargets>,
): SchedulerAndTargets =>
    ({
        schedulerUuid: 'scheduler-uuid',
        format: SchedulerFormat.CSV,
        thresholds: [],
        ...overrides,
    }) as SchedulerAndTargets;

describe('isDeliveryListScheduler', () => {
    it('excludes gsheets syncs from the delivery list', () => {
        expect(
            isDeliveryListScheduler(
                scheduler({ format: SchedulerFormat.GSHEETS }),
                false,
            ),
        ).toBe(false);
    });

    it('keeps csv/xlsx/image deliveries in the delivery list', () => {
        for (const format of [
            SchedulerFormat.CSV,
            SchedulerFormat.XLSX,
            SchedulerFormat.IMAGE,
        ]) {
            expect(isDeliveryListScheduler(scheduler({ format }), false)).toBe(
                true,
            );
        }
    });

    it('routes threshold alerts to the alert list only', () => {
        const alert = scheduler({
            thresholds: [{}] as SchedulerAndTargets['thresholds'],
        });
        expect(isDeliveryListScheduler(alert, true)).toBe(true);
        expect(isDeliveryListScheduler(alert, false)).toBe(false);
    });
});
