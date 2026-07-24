import { describe, expect, it } from 'vitest';
import {
    shiftToProjectTimezone,
    unshiftFromProjectTimezone,
} from './FilterDateTimePicker.utils';

describe('FilterDateTimePicker timezone shift', () => {
    it.each([
        ['America/New_York', new Date(Date.UTC(2024, 5, 15, 10, 30, 0))],
        ['America/New_York', new Date(Date.UTC(2024, 0, 15, 10, 30, 0))],
        ['Europe/Helsinki', new Date(Date.UTC(2024, 5, 15, 22, 0, 0))],
        ['Asia/Tokyo', new Date(Date.UTC(2024, 5, 15, 23, 30, 0))],
        ['Pacific/Auckland', new Date(Date.UTC(2024, 5, 15, 0, 15, 0))],
        ['Pacific/Auckland', new Date(Date.UTC(2024, 0, 15, 0, 15, 0))],
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

    it('normalizes a New York DST gap using the existing Day.js policy', () => {
        const nonexistentWallClock = new Date(2024, 2, 10, 2, 30);

        const restored = unshiftFromProjectTimezone(
            nonexistentWallClock,
            'America/New_York',
        );
        const normalized = shiftToProjectTimezone(restored, 'America/New_York');

        expect(restored.toISOString()).toBe('2024-03-10T07:30:00.000Z');
        expect([
            normalized.getFullYear(),
            normalized.getMonth(),
            normalized.getDate(),
            normalized.getHours(),
            normalized.getMinutes(),
        ]).toEqual([2024, 2, 10, 3, 30]);
    });

    it('selects the earlier New York offset during a DST fold', () => {
        const ambiguousWallClock = new Date(2024, 10, 3, 1, 30);

        const restored = unshiftFromProjectTimezone(
            ambiguousWallClock,
            'America/New_York',
        );
        const shifted = shiftToProjectTimezone(restored, 'America/New_York');

        expect(restored.toISOString()).toBe('2024-11-03T05:30:00.000Z');
        expect([
            shifted.getFullYear(),
            shifted.getMonth(),
            shifted.getDate(),
            shifted.getHours(),
            shifted.getMinutes(),
        ]).toEqual([2024, 10, 3, 1, 30]);
    });
});
