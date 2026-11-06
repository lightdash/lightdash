import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    shiftToProjectTimezone,
    unshiftFromProjectTimezone,
} from './FilterDateTimePicker.utils';

const SYSTEM_TIMES = [
    ['northern summer', new Date(Date.UTC(2026, 6, 1, 12, 0, 0))],
    ['northern winter', new Date(Date.UTC(2026, 0, 1, 12, 0, 0))],
] as const;

describe('FilterDateTimePicker timezone shift', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

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

    it.each(SYSTEM_TIMES)(
        'normalizes a New York DST gap using the existing Day.js policy (%s)',
        (_season, systemTime) => {
            vi.setSystemTime(systemTime);
            const nonexistentWallClock = new Date(2024, 2, 10, 2, 30);

            const restored = unshiftFromProjectTimezone(
                nonexistentWallClock,
                'America/New_York',
            );
            const normalized = shiftToProjectTimezone(
                restored,
                'America/New_York',
            );

            expect(restored.toISOString()).toBe('2024-03-10T07:30:00.000Z');
            expect([
                normalized.getFullYear(),
                normalized.getMonth(),
                normalized.getDate(),
                normalized.getHours(),
                normalized.getMinutes(),
            ]).toEqual([2024, 2, 10, 3, 30]);
        },
    );

    it.each(SYSTEM_TIMES)(
        'selects the earlier New York offset during a DST fold (%s)',
        (_season, systemTime) => {
            vi.setSystemTime(systemTime);
            const ambiguousWallClock = new Date(2024, 10, 3, 1, 30);

            const restored = unshiftFromProjectTimezone(
                ambiguousWallClock,
                'America/New_York',
            );
            const shifted = shiftToProjectTimezone(
                restored,
                'America/New_York',
            );

            expect(restored.toISOString()).toBe('2024-11-03T05:30:00.000Z');
            expect([
                shifted.getFullYear(),
                shifted.getMonth(),
                shifted.getDate(),
                shifted.getHours(),
                shifted.getMinutes(),
            ]).toEqual([2024, 10, 3, 1, 30]);
        },
    );

    it.each(SYSTEM_TIMES)(
        'selects the earlier offset during a 30 minute Lord Howe fold (%s)',
        (_season, systemTime) => {
            vi.setSystemTime(systemTime);
            const ambiguousWallClock = new Date(2024, 3, 7, 1, 45);

            const restored = unshiftFromProjectTimezone(
                ambiguousWallClock,
                'Australia/Lord_Howe',
            );

            expect(restored.toISOString()).toBe('2024-04-06T14:45:00.000Z');
        },
    );

    it.each(SYSTEM_TIMES)(
        'keeps the post-transition offset for times just after a New York fold (%s)',
        (_season, systemTime) => {
            vi.setSystemTime(systemTime);
            const wallClock = new Date(2024, 10, 3, 10, 0);

            const restored = unshiftFromProjectTimezone(
                wallClock,
                'America/New_York',
            );

            expect(restored.toISOString()).toBe('2024-11-03T15:00:00.000Z');
        },
    );
});
