import { describe, expect, it } from 'vitest';
import {
    shiftToProjectTimezone,
    unshiftFromProjectTimezone,
} from './FilterDateTimePicker.utils';

describe('FilterDateTimePicker timezone shift', () => {
    it.each([
        ['America/New_York', new Date(Date.UTC(2024, 5, 15, 10, 30, 0))],
        ['Europe/Helsinki', new Date(Date.UTC(2024, 5, 15, 22, 0, 0))],
        ['Asia/Tokyo', new Date(Date.UTC(2024, 5, 15, 23, 30, 0))],
        ['Pacific/Auckland', new Date(Date.UTC(2024, 5, 15, 0, 15, 0))],
        ['UTC', new Date(Date.UTC(2024, 5, 15, 12, 0, 0))],
    ])(
        'round-trips unshift(shift(value)) === value for %s',
        (projectTimezone, value) => {
            const shifted = shiftToProjectTimezone(value, projectTimezone);
            const restored = unshiftFromProjectTimezone(
                shifted,
                projectTimezone,
            );
            expect(restored.toISOString()).toBe(value.toISOString());
        },
    );
});
